/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

import axios from 'axios';
import { setUserData } from './data';

const serverBaseURL = import.meta.env.VITE_REACT_APP_SERVER_URL
  ? import.meta.env.VITE_REACT_APP_SERVER_URL
  : '';

const authClient = axios.create({
  baseURL: serverBaseURL,
  withCredentials: true,
  headers: {
    'Cache-Control': 'no-store',
  },
});

const refreshRaceDelays = [80, 200, 500];
let refreshPromise = null;
let authEpoch = 0;
let authState = {
  accessToken: null,
  accessExpiresAt: null,
  session: null,
};

function isRecord(value) {
  return Boolean(value) && typeof value === 'object';
}

function isAuthUser(value) {
  return (
    isRecord(value) &&
    Number.isInteger(value.id) &&
    value.id > 0 &&
    typeof value.username === 'string' &&
    typeof value.role === 'number'
  );
}

function isLoginSession(value) {
  return (
    isRecord(value) &&
    typeof value.sid === 'string' &&
    value.sid.length > 0 &&
    typeof value.current === 'boolean' &&
    typeof value.login_method === 'string' &&
    typeof value.ip === 'string' &&
    typeof value.user_agent === 'string' &&
    typeof value.created_at === 'number' &&
    typeof value.last_active_at === 'number' &&
    typeof value.expires_at === 'number'
  );
}

export function isAuthBundle(value) {
  return (
    isRecord(value) &&
    typeof value.access_token === 'string' &&
    value.access_token.length > 0 &&
    value.token_type === 'Bearer' &&
    typeof value.access_expires_at === 'number' &&
    Number.isFinite(value.access_expires_at) &&
    value.access_expires_at > 0 &&
    isAuthUser(value.user) &&
    isLoginSession(value.session) &&
    value.session.current
  );
}

export function applyAuthBundle(bundle, userDispatch) {
  if (!isAuthBundle(bundle)) {
    throw new Error('Invalid authentication response');
  }

  authEpoch += 1;
  authState = {
    accessToken: bundle.access_token,
    accessExpiresAt: bundle.access_expires_at,
    session: bundle.session,
  };
  setUserData(bundle.user);
  userDispatch?.({ type: 'login', payload: bundle.user });
  return bundle.user;
}

function clearRuntimeAuthentication() {
  authEpoch += 1;
  authState = {
    accessToken: null,
    accessExpiresAt: null,
    session: null,
  };
}

export function clearAuthentication(userDispatch) {
  clearRuntimeAuthentication();
  localStorage.removeItem('user');
  userDispatch?.({ type: 'logout' });
}

export function getAccessToken() {
  return authState.accessToken;
}

export async function getValidAccessToken(minValiditySeconds = 30) {
  const normalizedMinValidity = Math.max(0, Number(minValiditySeconds) || 0);
  const now = Math.floor(Date.now() / 1000);
  if (
    authState.accessToken &&
    authState.accessExpiresAt > now + normalizedMinValidity
  ) {
    return authState.accessToken;
  }

  const outcome = await refreshAuthentication();
  if (outcome.kind === 'authenticated') {
    return outcome.bundle.access_token;
  }

  const fallbackNow = Math.floor(Date.now() / 1000);
  if (authState.accessToken && authState.accessExpiresAt > fallbackNow) {
    return authState.accessToken;
  }
  return null;
}

export function getAuthSessionId() {
  return authState.session?.sid;
}

async function waitForRefreshRace(delay) {
  await new Promise((resolve) => globalThis.setTimeout(resolve, delay));
}

async function requestRefresh(expectedSID) {
  try {
    const response = await authClient.post(
      '/api/user/auth/refresh',
      undefined,
      {
        headers: expectedSID ? { 'X-Auth-Session': expectedSID } : undefined,
      },
    );
    return { status: response.status, data: response.data };
  } catch (error) {
    if (!axios.isAxiosError(error)) {
      return { status: 0, error };
    }
    return {
      status: error.response?.status || 0,
      data: error.response?.data,
      error,
    };
  }
}

async function runRefresh(
  refreshEpoch,
  raceAttempt = 0,
  allowMismatchRetry = true,
) {
  if (authEpoch !== refreshEpoch) {
    return { kind: 'transient_error', error: new Error('Refresh superseded') };
  }

  const response = await requestRefresh(getAuthSessionId());
  if (authEpoch !== refreshEpoch) {
    return { kind: 'transient_error', error: new Error('Refresh superseded') };
  }

  const responseData = isRecord(response.data) ? response.data : undefined;
  const code =
    typeof responseData?.code === 'string' ? responseData.code : undefined;
  if (responseData?.success === true && isAuthBundle(responseData.data)) {
    applyAuthBundle(responseData.data);
    return { kind: 'authenticated', bundle: responseData.data };
  }

  if (response.status === 409 && code === 'AUTH_REFRESH_RACE') {
    const delay = refreshRaceDelays[raceAttempt];
    if (delay !== undefined) {
      await waitForRefreshRace(delay);
      return runRefresh(refreshEpoch, raceAttempt + 1, allowMismatchRetry);
    }
    clearAuthentication();
    return { kind: 'out_of_sync', code };
  }

  if (response.status === 409 && code === 'AUTH_SESSION_MISMATCH') {
    if (allowMismatchRetry) {
      clearRuntimeAuthentication();
      return runRefresh(authEpoch, 0, false);
    }
    clearAuthentication();
    return { kind: 'out_of_sync', code };
  }

  if (response.status === 401) {
    clearAuthentication();
    return { kind: 'anonymous' };
  }

  if (!response.status || response.status >= 500 || response.status === 429) {
    return { kind: 'transient_error', error: response.error || response.data };
  }

  clearAuthentication();
  return { kind: 'out_of_sync', code: code || 'AUTH_INVALID_REFRESH_RESPONSE' };
}

export function refreshAuthentication() {
  if (!refreshPromise) {
    const refreshEpoch = authEpoch;
    refreshPromise = runRefresh(refreshEpoch).finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

export async function bootstrapAuthentication(userDispatch) {
  const outcome = await refreshAuthentication();
  if (outcome.kind === 'authenticated') {
    userDispatch?.({ type: 'login', payload: outcome.bundle.user });
  } else if (outcome.kind === 'anonymous' || outcome.kind === 'out_of_sync') {
    userDispatch?.({ type: 'logout' });
  }
  return outcome;
}

async function requestLogout() {
  const headers = {};
  const accessToken = getAccessToken();
  const sessionID = getAuthSessionId();
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (sessionID) headers['X-Auth-Session'] = sessionID;
  return authClient.post('/api/user/auth/logout', undefined, { headers });
}

export async function logoutAuthentication(userDispatch) {
  try {
    await requestLogout();
  } catch (error) {
    const code = axios.isAxiosError(error)
      ? error.response?.data?.code
      : undefined;
    if (
      axios.isAxiosError(error) &&
      error.response?.status === 409 &&
      code === 'AUTH_SESSION_MISMATCH'
    ) {
      const outcome = await refreshAuthentication();
      if (outcome.kind === 'authenticated') {
        await requestLogout();
      }
    } else if (!axios.isAxiosError(error) || error.response?.status !== 401) {
      throw error;
    }
  } finally {
    clearAuthentication(userDispatch);
  }
}

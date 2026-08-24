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

const authErrorMessageKeys = {
  AUTH_SESSION_LIMIT:
    'Too many active login sessions. On a device where you are already signed in, open Login sessions and use “Sign out other sessions” to revoke them. If you cannot access a signed-in device, reset your password to sign out all sessions.',
  AUTH_SESSION_ISSUANCE_LIMIT:
    'Too many login sessions were created recently. Please wait for the rolling window to pass, then try again.',
};

function positiveRetryAfterSeconds(error) {
  const rawValue = error?.response?.headers?.['retry-after'];
  const seconds = Number.parseInt(rawValue, 10);
  return Number.isInteger(seconds) && seconds > 0 ? seconds : null;
}

export function getAuthErrorMessage(error, t) {
  const code = error?.response?.data?.code;
  const messageKey = authErrorMessageKeys[code];
  if (messageKey) {
    return t(messageKey);
  }

  if (error?.response?.status === 429) {
    const seconds = positiveRetryAfterSeconds(error);
    if (seconds) {
      return t(
        'Too many login attempts. Please wait {{seconds}} seconds and try again.',
        { seconds },
      );
    }
    return t('Too many login attempts. Please try again later.');
  }

  const serverMessage = error?.response?.data?.message;
  if (
    typeof serverMessage === 'string' &&
    serverMessage &&
    serverMessage !== 'Conflict' &&
    serverMessage !== 'Too Many Requests'
  ) {
    return serverMessage;
  }

  return t('Login failed. Please try again.');
}

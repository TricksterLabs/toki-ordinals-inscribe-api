import crypto from 'crypto';

function generateRandomText(length) {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const randomBytes = crypto.randomBytes(length);
  const result = new Array(length);
  for (let i = 0; i < length; i++) {
    result[i] = characters[randomBytes[i] % characters.length];
  }
  return result.join('');
}

export const generateSession = () => {
  const session = generateRandomText(20);
  return session;
}

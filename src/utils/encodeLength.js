import { encode } from './customVaruint.js';

export const encodeLength = (dataInput) => {
  const data = Buffer.from(dataInput);
  const chunkSize = 520;
  const chunks = [];
  for (let i = 0; i < data.length; i += chunkSize) {
    chunks.push(data.slice(i, i + chunkSize));
  }

  let message = '';
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const lengthEncoded = encode(chunk.length);
    message += lengthEncoded.toString('hex') + chunk.toString('hex');
  }

  return message;
}
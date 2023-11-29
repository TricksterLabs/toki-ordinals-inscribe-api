const initString = `20`
const ordString = `ac0063036f72640101`
const delimiterString = `00`
const endString = `68`

import { encodeLength } from './encodeLength.js'

export const generateInscription = (internalPubkey, file) => {
  const inscription = initString + `${internalPubkey.toString('hex')}` + ordString + `${encodeLength(file.contentType)}` + delimiterString + `${encodeLength(file.rawData)}` + endString
  return inscription
}
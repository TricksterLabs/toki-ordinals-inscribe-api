import varuint from 'varuint-bitcoin'

import { Buffer } from 'safe-buffer'

const inputSize = 57.5
const outputSize = 43
const thirdWitness = 9
const header = 10.5
const unknown = 2

export const getMinFee = (inputsLength, outputsLength, inscription) => {
  const inscriptionBuffer = Buffer.from(inscription, 'hex')
  // console.log(inscriptionBuffer.length)
  const secondWitnessLength = varuint.encode(inscriptionBuffer.slice(unknown).length)
  const secondWitness = Math.ceil((inscriptionBuffer.slice(unknown).length + secondWitnessLength.length) / 4)
  // console.log('secondWitness', inscriptionBuffer.length)
  const totalSize = Math.ceil(header + thirdWitness + secondWitness + (inputsLength * inputSize) + (outputsLength * outputSize))
  return totalSize
}
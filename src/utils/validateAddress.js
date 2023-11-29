import bitcoin from "bitcoinjs-lib";

export const validateAddress = (address, network) => {
  try {
    bitcoin.address.toOutputScript(address, network);
    return true
  } catch (error) {
    return false
  }
}
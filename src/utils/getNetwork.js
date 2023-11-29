import bitcoin from 'bitcoinjs-lib'

const litecoinMainnet = {
  messagePrefix: '\x19Litecoin Signed Message:\n',
  bech32: 'ltc',
  bip32: {
    public: 0x019da462,
    private: 0x019d9cfe
  },
  pubKeyHash: 0x30,
  scriptHash: 0x32,
  wif: 0xb0
}

const litecoinTestnet = {
  messagePrefix: '\x19Litecoin Signed Message:\n',
  bech32: 'tltc',
  bip32: {
    public: 0x043587cf,
    private: 0x04358394,
  },
  pubKeyHash: 0x6f,
  scriptHash: 0xc4,
  wif: 0xef,
};

export const getNetwork = (network) => {
  switch (network) {
    case 'btc-mainnet':
      return bitcoin.networks.mainnet
    case 'btc-testnet':
      return bitcoin.networks.testnet
    case 'ltc-mainnet':
      return litecoinMainnet
    case 'ltc-testnet':
      return litecoinTestnet
    default:
      throw new Error(`Invalid network: ${network}`)
  }
}


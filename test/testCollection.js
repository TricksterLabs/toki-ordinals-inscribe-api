import { createCollectionTx } from '../src/transactions/createCollectionTx.js'
import { readJsonFile } from '../src/utils/jsonUtil.js'

const order_id = 9
const network = 'btc-mainnet'
const dataArray = await readJsonFile(`./orders/${order_id}.json`)
const order_dust_val = 546
const order_vbytes_cost = 4
const order_checkpoint_index = 1
const order_checkpoint_steps = 4

const inputs = [
  {
    txid: 'fd2293d3a0043bec6544131ee4c6b7bcb415c9b8fa6c665a2c32e765c288c157',
    vout: 1,
    value: 28722,
  }
]

// const inputs2 = [
//   {
//     txid: '7b350993752c8b2a9d95a456a47b7a19e9f7fee13d8a491fde5260f56a57b641',
//     vout: 0,
//     value: 777,
//   }
// ]
const inputs2 = [
  {
    txid: 'e9baa775e4727d3fc3adc666a956e426a7aea32f152749fc73a2cd7020fcfc67',
    vout: 1,
    value: 2222,
  }
]

// console.log(dataArray)

createCollectionTx(order_id, network, dataArray, inputs, inputs2, order_dust_val, order_vbytes_cost, order_checkpoint_index, order_checkpoint_steps)

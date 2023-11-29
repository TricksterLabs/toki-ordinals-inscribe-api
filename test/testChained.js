import { createChainedTx } from '../src/transactions/createChainedTx.js'
import { readJsonFile } from '../src/utils/jsonUtil.js'

const order_id = 33
const network = 'btc-mainnet'
const dataArray = await readJsonFile(`./orders/${order_id}.json`)
const order_dust_val = 546
const order_vbytes_cost = 3
const order_checkpoint_index = 1
const order_checkpoint_steps = 4

const inputs = [
  {
    txid: '8315fadc8eb6eaac62fe867cb964fead9938008d812d7e8e065e3b8697995817',
    vout: 1,
    value: 19540,
  }
]

// console.log(dataArray)

createChainedTx(order_id, network, dataArray, inputs, order_dust_val, order_vbytes_cost, order_checkpoint_index, order_checkpoint_steps)

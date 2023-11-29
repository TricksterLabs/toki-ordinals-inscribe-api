# toki-ordinals-inscribe-api

# install
- npm install
- create orders & logs folders
- change service address & mnemonics in config/constants.js
- run setup/create-toki-premint-db.js to init the db
- change electrum port and ip in /src/api/bitcoinApi.js so that the cron can scan for new payments
- play around with the code to set fees, etc.
- run both /src/api (for api requests) and /src/cron (to handle inscription starts, payment monitoring, etc.)

# description
This is an early javascript implementation of a bitcoin ordinals inscription service. Developers can use it to build their own or build upon it. I believe a good usecase would be to create a standalone app so that users can bulk inscribe on their own pc for free. It is very lightweight and I think the most important thing here is the custom ordinals creation codes. This does not require any ordinals node but just a connection to a bitcoin json rpc to watch for payments and create transactions. The code can use some optimizations.

# caveats
- There are 3 modes: bulk / chained / collection modes. 
- The bulk is the default one which works fine.
- None of the modes take into account the descendants you have on your payment tx.
- Collection mode is unfinished as far as I can remember (it uses parent-child)
- On chained there was a interaction where it would get stuck when inscribing the same asset (for example brc20) multiple times that I did not get to investigate.

There is more that can be discussed here but just get your hands dirty and test.

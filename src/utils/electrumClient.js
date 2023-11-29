import { ElectrumClient } from '@samouraiwallet/electrum-client';

export const createElectrumClient = () => {
  const client = new ElectrumClient(50001, "51.178.79.217", "tcp");
  return client.initElectrum({ client: 'electrum-client-js', version: ['1.2', '1.4'] }, {
    retryPeriod: 5000,
    maxRetry: 10,
    pingPeriod: 5000,
  }).then(() => client);
};
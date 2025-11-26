require('dotenv').config()
require('@nomiclabs/hardhat-waffle')

module.exports = {
  solidity: '0.8.4',
  networks: {
    hardhat: {
      chainId: 1337,
    },
    amoy: {
      url: 'https://polygon-amoy.g.alchemy.com/v2/rjBVXrHbF5xukduFbAsrG',
      accounts: [`0x${process.env.PRIVATE_KEY}`],
    },
  },
}
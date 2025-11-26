// scripts/deploy.js
const hre = require('hardhat');
const fs = require('fs');

async function waitFor(contract) {
  // Compatibilidad ethers v5/v6
  if (typeof contract.waitForDeployment === 'function') {
    await contract.waitForDeployment(); // v6
    return await contract.getAddress();
  } else {
    await contract.deployed(); // v5
    return contract.address;
  }
}

async function deploy(contractName, args = []) {
  const Factory = await hre.ethers.getContractFactory(contractName);
  const contract = await Factory.deploy(...args);
  const address = await waitFor(contract);
  console.log(`✅ ${contractName} deployed at: ${address}`);
  return address;
}

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log('Deployer:', deployer.address);
  console.log('Network:', hre.network.name);

  // Asegura compilar antes de desplegar
  await hre.run('compile');

  // 1) Despliega WavePortal (tu contrato existente)
  const waveAddress = await deploy('WavePortal');

  // 2) Despliega DocumentSign (nuevo para registrar firmas de documentos)
  const docSignAddress = await deploy('DocumentSign');

  // 3) (Opcional) Verificar en Etherscan si tienes ETHERSCAN_API_KEY y es red pública
  if (hre.network.name !== 'hardhat' && process.env.ETHERSCAN_API_KEY) {
    for (const { addr, args } of [
      { addr: waveAddress, args: [] },
      { addr: docSignAddress, args: [] },
    ]) {
      try {
        console.log(`⌛ Verifying ${addr}...`);
        await hre.run('verify:verify', {
          address: addr,
          constructorArguments: args,
        });
        console.log('✅ Verified!');
      } catch (err) {
        console.log('⚠️  Verify skipped/failed:', err.message || err);
      }
    }
  }

  // 4) (Opcional) Guarda direcciones en un JSON para backend/front
  const out = {
    network: hre.network.name,
    WavePortal: waveAddress,
    DocumentSign: docSignAddress,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync('./deployed-addresses.json', JSON.stringify(out, null, 2));
  console.log('📝 Addresses saved to deployed-addresses.json');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

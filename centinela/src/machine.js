import os from "node:os";

function primaryIp() {
  const interfaces = os.networkInterfaces();
  for (const list of Object.values(interfaces)) {
    for (const item of list || []) {
      if (item.family === "IPv4" && !item.internal) return item.address;
    }
  }
  return "127.0.0.1";
}

export function machineInfo() {
  return {
    hostname: process.env.MACHINE_HOST || os.hostname(),
    ip: process.env.MACHINE_IP || primaryIp(),
    os: process.env.MACHINE_OS || `${os.type()} ${os.release()}`,
    arch: os.arch(),
    cpus: (os.cpus() || []).length || null,
    memoryGb:
      Number(process.env.MACHINE_RAM_GB) ||
      Math.round((os.totalmem() / 1024 ** 3) * 10) / 10,
    uptimeSeconds: Math.floor(os.uptime()),
    platform: os.platform(),
  };
}

export const BITVAVO_ADDRESS = 'bitvavo:account';

export function isBitvavoWallet(address: string): boolean {
  return address.startsWith('bitvavo:');
}

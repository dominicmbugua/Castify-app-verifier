// Every platform adapter implements verify() and returns a partial result:
// { status, appName, developer, version, notes }
export class BaseAdapter {
  get platform() {
    throw new Error('platform getter not implemented');
  }

  // eslint-disable-next-line no-unused-vars
  async verify(url, info) {
    throw new Error('verify() not implemented');
  }
}

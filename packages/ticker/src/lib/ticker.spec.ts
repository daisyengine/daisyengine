import { Ticker } from './ticker';

describe('ticker', () => {
  it('should work', async () => {
    let i = 0;
    const ticker = new Ticker(
      () => {
        i++;
      },
      10,
      25,
      false
    );

    ticker.start();
    await new Promise((resolve) => setTimeout(resolve, 1000));
    ticker.stop();

    expect(i).toEqual(10);
  });
});

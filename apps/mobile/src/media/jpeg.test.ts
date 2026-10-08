/**
 * THE JPEG READER (2026-09-29), held to files a real encoder wrote and to what a phone's encoder
 * writes. `media/jpeg.ts` reads a stored picture's blocks so `blankPicture.ts` can tell whether its
 * circle shows anything; a reader that misread a real photo could hide it, so it is checked against
 * libjpeg (through Pillow, whose files and decodes are below, byte for byte) and not only against
 * the test writer beside it (`testing/jpeg.ts`), which Pillow in turn read back where it was written.
 */
import { describe, expect, it } from 'vitest';
import { decodeJpeg, encodeJpeg } from '../testing/jpeg';
import { BABY_AVATARS, type BabyAvatarDef } from './avatars/art';
import { avatarPicture } from './avatars/picture';
import type { Raster } from './avatars/raster';
import { blockPixels, JpegRefused, readJpeg } from './jpeg';

const bytesOf = (b64: string): Uint8Array => new Uint8Array(Buffer.from(b64, 'base64'));

/*
  Made by tools that are not in the repository and need not be: Pillow 12.3.0 (libjpeg-turbo)
  wrote each file from one 24 × 16 picture with a gradient, a disc and noise, and decoded it again;
  each `_PILLOW` string is that decode, red, green and blue, row by row.
*/
// P444: 853 bytes, Pillow 12.3.0, {'quality': 80, 'subsampling': 0}
const P444 =
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAQABgDAREAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDznwzKsMaZGGU4B9K4cZkzm79D9Gq5lGjS5H2PWbb4fTvbpPNeKlwUGYduQhH8O7P0HA/Ovh6maUObkhG8b79/l/m/uPhc0yv67JycrP0udN4TiaxxHMCHj+U/Xpissblca8VKGt9T5qnV+opwnuj5x05JDc/KTgNwOvY1/S1XJ4uN2j6PNsVJVbI+kfDuvrqFijSReXPtG5VHy59uc4/lnvX4hj/D/FUcQ405p076N35reata69dfI9CjilVgpPf+tiZoSZNy5BY9AM8n+lfR0snVGnGnbSKtf0PzXiis1Nyj1Z//2Q==';
const P444_PILLOW =
  'cgEAnwYJwg8SyBgLyRoA1iMA20MA0mIMoz4Gs3wXdXgASnwLJ3gbIowOIqIAIKsAL6UQWsUHc8YAj8wPoNMMteIA1/sA2/IEdwQLnQURvw4UyBwQziMH2ysE10AJyVkRpFYOmWoQYFcUP1gfTIQVTJcGLYEFOJEnLagPUsAHbsQBkcwaptMYs9wA0fMI1vIUfAYgnQUeuQ8cxCEazi4W2jIX0T8avE4dplwvgFAgeXIiVHIcPnUxM4sbHpUHIaFAL6oTTrsUbsEXlMwtqdIrs9kSx+0bzfQpfQUzmAMtsA0ouSQmwjInzDQnxDwur0kynFwfmG8Vfmc7T045ZogqVZgNN5QQPbAfOaciUrYvccE8j8lBqNA5td4sve8uvfczeQNAkQA9ogw5pSQ6rDA6tTI6rzxBoU1Lf0BJqXdU3sE56dMd6Mou2sAj0sA4kHxJVKQzY7FMdb9cg8JPms1AsORCrvI9pPc1eQNPigBNlgtOkiJQki5QmC9NmDxTjVFbnlxE68E3+dsj7sgn8cQp57gq8cc94ccYgqw8ea9beL1teMFWjNBJoOVUl+1OjfZCewdahwFYiwtggiNnfzBnhDBhfzxddlFi+b4m8MEt7c0s7tcz38wn6+IZ6Okfy8s3u8JAj7BXe7tvc8lcg9hWjeNmfuNhffhhfQtghANghAtqeSR3eDJ4eDNsczxjZU5i/84Y6cMA58oX8dI868cp+dIf5r0V9s475NZBobNPfLtqdtJjgeFjgOB0b9xxePp8hAaBegx/bhmAYCR8XDR7SCxnW0N1YEl33q8t+b04/8co6LwV69o04doa8NYQ/8or5cMKqLJ1gL6VetBtbs5sX9+CV/CITOWKfQCIbwSGXw6GUhuDTy6JPyp5VEOJWkqL+MwJ7cMj6Mcu9NQr9tEh980j78ok5sgs6sggpq57friif9COcNGMU9mQSuuNTO+SfwajbQScVAmXQxSWQCmeLiWOQz2fR0Kg6dAt59If5cko981H7bop/88v+dQt890n6sRJrrOThbi5fcipZsuhRtahN+aXOuuTgAy3aQivTgqrORWrNyu1JiemNj2yOD+xZleY0MMp7MES66xC99Yn79we0rAq78Qo2K93uLuyk8LIeMKrXcqgRuS0NPC2K+WkdQa9YQS3Rgq3NBq8NTLLJC+8NkTHNkXEVEj/iGqm58Yf/NkA4r045tMu/eRJ3Je0x56ssrnDlsbIfsitZNmkSfHAN/bUMu/HcwXKXwXHRQ3INB3QMjXcIjHMNETVNETPXUzYd2Pgk3HSpG3B3JHj2JDC0pu41KnWxKHhqrXLk8DGh83DbeK2POa/JufUOPPYdQjfYQjcSBHgNR/kMzXsIy/ZNkLiOkPcX1rBcWfahGrnpnrc1Jnb05XUx4/WyZ/ewKn5qLnTkLzXisbqbtvYNtzOI97XQPXScgPmXwTlRw/qNh7wNjX7KTLpQkr1SU7wT1r/d2fulGTsq3L9onzju5vuy5r13Zb0s6X0q8Dblr7vh7v/btX4ROfwNu7sTv/S';
// P420: 466 bytes, Pillow 12.3.0, {'quality': 80, 'subsampling': 2, 'optimize': True, 'restart_marker_blocks': 2}
const P420 =
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAQABgDASIAAhEBAxEB/8QAGAAAAgMAAAAAAAAAAAAAAAAAAAcCBAj/xAApEAABAwIEBAcBAAAAAAAAAAABAgMRAAQFBhIhIjFBcQcTQlFhkbHB/8QAFwEAAwEAAAAAAAAAAAAAAAAABAUGB//EAB8RAAAFBQEBAAAAAAAAAAAAAAIDBBExAAEFBhJBYf/dAAQAAv/aAAwDAQACEQMRAD8AXOWXUstokQpJgH2ps23h8+u3Q+9eJRcFAlnTIQR6dU9hsPukvhyHDc8JMBWw59DWkcu4+nELFCnGvLf0jUlI4Z+N5j8nrQm1a0uScGIi+nd4+NPk0+XLC8kISY6A1DKbSrGG3gQtvhPflFFWVMkuakyCo8gJ3P8AKKnzdPCcLsyzXrMF+bEgOunBFq//2Q==';
const P420_PILLOW =
  'iAAAnQYLtRQavxkZwhsLxykC1EcC1GIMmUgAq34hdnIOVXcJNXYALYkCKpsDLKIANqUAW8EVbcURhdARnNUMst8I1PcU1vQKjAAFnAYRsRQbwB4cxyQVyzARzUQOyVgSp1UJmGoUY1oAQ14AS4UVRZcbI4cBL5sJO6MIWboVa8EUh9EantgUrNwMzfMW0fQRjQAZmQccqxUevSMhyC4iyjcjx0AqvEwnrVokhFILgG8fX20VS3QURIIfN4MhQJYnRJ4YWrMbb78gitEpntklqdwbwu8iy/YiiwAskgYpoxQotSYswDIuwTgyuz0+skc3plcfnmsahGwSVlgAbYccYo0iToQiW5w0UZsgYrAmd8Axic41mtkzqOMzuPEzvvYzhQA/igM7mBI3pyM6ri84rjU8rjtMq0s/j0gAsIEP2sBF2tFOydRJts0/r89IbZcXZJ4lbrA1f8BAg8U9kdJApehLrPFJq/FDggBNgwRLjRBImCFLnCtJmi9JnDlYoEtEomYG7ME29dZK4Ms81s82x8gsz9k8vNJDhK01fLJDg75KgMBGidBMmudbl+tXle5UgAVWfQZWgxBdiSBjiixhhy9fiDZmj0pF7rtQ68Qr7sk98tBI4sg37tlA7+A9y8s1rcVTirRQh7pRg8NTh9VeiuRofuNfhvJrfwlneQdmeBBvfiF6fS96dzJzdzdzfUdH8spY48Ae68I0+M1D7cUy9NAx4MER5dc4zdlplbZbibhYiMlliNtxfOJ0at9se/iCfQt8eA59chWHah2HaCyGViNwaDt+cElM0LJA58ok9cw26Lkl/9Aw+swe+dEQ7dUrwsZXoLlmkr5nh8lvccxtadx3ZemDVuN6dASOawWMXwyOVxaMVimORiV8Wz+MZU1d3Mhn4Mct7MQv/M4y/c0j/c0V98sG5sogzclln7Rvj7lvic5+cdOAXNiAVeaLUO6RdwivaQWlVAmZRxORRCmUNCWESTyUUkZq1smF4MxP6MQ4+s8y7b8R/9MY/tUX9dg8z8lzqLmFk7yCg8uLZs+KT9WMROGUP+eZegzHaAe4UAqoPxWfOyulKieYPTuoREGEa2JRy7dy3bpc3rNA/M1J/M9C2K4k4cNVwrmCssGknMaie8SZXcyZUuCmRemsMuKicwXIYQO8SwmzOxi0OTHCJy+4OkLLQUOwYlePiXGB2rKq8L6j4q6G77yP/tGoyqiMtqmhsLy6nMa8fci0ZNW3WOnAR/HEOO69cQXMYATHSQvGOxrLNjPcIjDRNEPcOkLHXVK4gmaxn3KpqXKZ1J64zZmvzJ+20K7HuqzGqrTNlr3Mgs3Qat7RSt7GNePCOvTPdQrSZAnSTQ/cPBvmNDL1Hy/kMUXkOUbSX1bTfmLQlWfJr3jM0Zniy5nWvpbKwqXVva/irLTikrrdgM3hZ93hQdfMLNzHOvfbcAjPYAfTTQ7jOhvyNjT/IjTwOFDyRFPiX1nhf2Xklmbcrnbhr3jWx5bnx6Dhw6fitafksLnwmL7re8jkZ9voTuTiPe7eRf/s';
const PROGRESSIVE =
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wgARCAAQABgDASIAAhEBAxEB/8QAGAAAAgMAAAAAAAAAAAAAAAAAAAYCAwf/xAAXAQADAQAAAAAAAAAAAAAAAAADBAUG/9oADAMBAAIQAxAAAAFcbEvSQvxLSfl//8QAHRAAAQQCAwAAAAAAAAAAAAAAAQIEERIAAwUTIf/aAAgBAQABBQJsYCePNWgpmubN9/YiPf/EABoRAAIDAQEAAAAAAAAAAAAAAAEDAAIEE0H/2gAIAQMBAT8Be6ukld/I/aUX5if/xAAZEQACAwEAAAAAAAAAAAAAAAACAwAFEQH/2gAIAQIBAT8Bta16sJI7Cp+H3Sn/xAAcEAABAwUAAAAAAAAAAAAAAAABABARAiEiQVH/2gAIAQEABj8CUmvLig6a4gt//8QAGxABAAIDAQEAAAAAAAAAAAAAAQAxESFRQWH/2gAIAQEAAT8hIukSDGHmvmYnbpBR2GLodhUbj2f/2gAMAwEAAgADAAAAEGs//8QAFhEAAwAAAAAAAAAAAAAAAAAAAAEx/9oACAEDAQE/EIBB6ij/xAAZEQADAAMAAAAAAAAAAAAAAAAAETEBQWH/2gAIAQIBAT8Qq0bnFdUUJZP/xAAfEAEAAgICAgMAAAAAAAAAAAABESEAMUFhUXGRscH/2gAIAQEAAT8QlEhIHxj7EZsGdnoo+chAS571GOuYKG+HKRKgbdXMfU84jYFaCbfzP//Z';

/** The largest and the mean difference, per channel, between two pictures of one size. */
function apart(a: Uint8Array, b: Uint8Array): { max: number; mean: number } {
  let max = 0;
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) {
    const d = Math.abs((a[i] ?? 0) - (b[i] ?? 0));
    max = Math.max(max, d);
    sum += d;
  }
  return { max, mean: sum / a.length };
}

/** Each pixel's brightness (JFIF's Y), which the way chroma is spread over its pixels leaves alone. */
const luma = (rgb: Uint8Array): Uint8Array => {
  const out = new Uint8Array(rgb.length / 3);
  for (let p = 0; p < out.length; p += 1)
    out[p] = Math.round(
      0.299 * (rgb[3 * p] ?? 0) + 0.587 * (rgb[3 * p + 1] ?? 0) + 0.114 * (rgb[3 * p + 2] ?? 0),
    );
  return out;
};

describe('reads what libjpeg writes', () => {
  it('a 4:4:4 file, pixel for pixel, to within the rounding of two inverse DCTs', () => {
    const mine = decodeJpeg(bytesOf(P444));
    expect([mine.width, mine.height]).toEqual([24, 16]);
    const d = apart(mine.rgb, bytesOf(P444_PILLOW));
    expect(d.max).toBeLessThanOrEqual(3);
    expect(d.mean).toBeLessThan(0.1);
  });

  it('a 4:2:0 file with optimized tables and restart markers: the same brightness everywhere', () => {
    const file = bytesOf(P420);
    // the file really has what the test says: a restart interval
    expect(Buffer.from(file).includes(Buffer.from([0xff, 0xdd]))).toBe(true);
    const pillow = bytesOf(P420_PILLOW);
    // spread over its four pixels the way libjpeg spreads it, each chroma sample is libjpeg's own
    const smooth = apart(decodeJpeg(file, { smooth: true }).rgb, pillow);
    expect(smooth.max).toBeLessThanOrEqual(3);
    expect(smooth.mean).toBeLessThan(0.2);
    // repeated over them, as the app rebuilds a corner, only the color at a sharp edge moves: the
    // brightness stays, but where a channel is pushed past 0 or 255
    const y = apart(luma(decodeJpeg(file).rgb), luma(pillow));
    expect(y.max).toBeLessThanOrEqual(6);
    expect(y.mean).toBeLessThan(0.5);
  });

  it('refuses a progressive file, and says so, rather than reading it wrong', () => {
    expect(() => readJpeg(bytesOf(PROGRESSIVE), () => true)).toThrow(JpegRefused);
    expect(() => readJpeg(bytesOf(PROGRESSIVE), () => true)).toThrow(/not sequential Huffman/);
  });
});

describe('reads what a phone writes', () => {
  const drawing: Raster = avatarPicture(BABY_AVATARS[0] as BabyAvatarDef);

  it('4:2:0, 4:4:4 and gray, with and without restart markers: the picture that went in', () => {
    for (const options of [
      { sampling: '420' },
      { sampling: '444' },
      { sampling: '420', restart: 7 },
      { sampling: '444', restart: 1 },
      { sampling: '420', quality: 95 },
    ] as const) {
      const back = decodeJpeg(encodeJpeg(drawing, options));
      expect([back.width, back.height]).toEqual([drawing.width, drawing.height]);
      // a JPEG at 80 moves a drawing's flat colors not at all and its edges a little
      expect(apart(back.rgb, drawing.rgb).mean, JSON.stringify(options)).toBeLessThan(2);
    }
    const gray = decodeJpeg(encodeJpeg(drawing, { sampling: 'gray' }));
    expect(apart(luma(gray.rgb), luma(drawing.rgb)).mean).toBeLessThan(2);
  });

  it('a size that is not a whole number of blocks: the padding is read and never shown', () => {
    const small: Raster = { width: 37, height: 29, rgb: drawing.rgb.subarray(0, 37 * 29 * 3) };
    const back = decodeJpeg(encodeJpeg(small, { sampling: '420', restart: 3 }));
    expect([back.width, back.height]).toEqual([37, 29]);
    expect(apart(back.rgb, small.rgb).mean).toBeLessThan(3);
  });

  it('hands over every block, in order, and stops the moment it is told to', () => {
    const file = encodeJpeg(drawing, { sampling: '420' });
    let blocks = 0;
    const whole = readJpeg(file, () => {
      blocks += 1;
      return true;
    });
    expect(whole.finished).toBe(true);
    // 512 × 512 in 4:2:0: 32 × 32 MCUs of four luma blocks and two chroma blocks
    expect(blocks).toBe(32 * 32 * 6);
    let seen = 0;
    const stopped = readJpeg(file, () => {
      seen += 1;
      return seen < 10;
    });
    expect(stopped.finished).toBe(false);
    expect(seen).toBe(10);
  });

  it('knows a flat block by its frequencies alone: every one above the first is zero', () => {
    const flat: Raster = { width: 64, height: 64, rgb: new Uint8Array(64 * 64 * 3).fill(250) };
    let blocks = 0;
    readJpeg(encodeJpeg(flat), (_f, _c, _x, _y, coef, quant) => {
      blocks += 1;
      for (let i = 1; i < 64; i += 1) expect(coef[i]).toBe(0);
      // and its pixels, rebuilt, are all the one color
      expect(new Set(blockPixels(coef, quant)).size).toBe(1);
      return true;
    });
    expect(blocks).toBe(4 * 4 * 6);
  });
});

describe('refuses, with its reason, what it does not read', () => {
  const file = encodeJpeg(avatarPicture(BABY_AVATARS[1] as BabyAvatarDef));
  const verdict = (bytes: Uint8Array): string => {
    try {
      readJpeg(bytes, () => true);
      return 'read';
    } catch (err: unknown) {
      return err instanceof JpegRefused ? err.message : `threw ${String(err)}`;
    }
  };

  it('a PNG, nothing at all, and bytes that only begin like a JPEG', () => {
    expect(verdict(Uint8Array.from([0x89, 0x50, 0x4e, 0x47]))).toBe('not a JPEG');
    expect(verdict(new Uint8Array(0))).toBe('not a JPEG');
    expect(verdict(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 9, 8, 7, 6, 5]))).toMatch(
      /past the end/,
    );
  });

  it('a file cut short anywhere, and one whose picture is scrambled, without a stray error', () => {
    for (const keep of [0.1, 0.5, 0.9, 0.999]) {
      const cut = verdict(file.subarray(0, Math.floor(file.length * keep)));
      expect(cut, `${keep}`).not.toBe('read');
      expect(cut, `${keep}`).not.toMatch(/^threw/);
    }
    const scrambled = Uint8Array.from(file);
    for (let i = Math.floor(file.length / 2); i < file.length - 2; i += 7) scrambled[i] = 0x5a;
    expect(verdict(scrambled)).not.toMatch(/^threw/);
  });

  it('twelve-bit samples', () => {
    const twelve = Uint8Array.from(file);
    // the frame header's precision byte, right after its marker and length
    for (let i = 2; i < twelve.length - 4; i += 1)
      if (twelve[i] === 0xff && twelve[i + 1] === 0xc0) {
        twelve[i + 4] = 12;
        break;
      }
    expect(verdict(twelve)).toBe('12-bit samples');
  });
});

/**
 * `fontfaceobserver` in the boot smoke test: happy-dom draws no text, so no face ever reports as
 * loaded, and the real observer polls on a timer for twelve seconds (expo-font's web loader). A
 * test that finished sooner left that timer running into the next file's teardown, where it threw
 * on a document that was gone: a red run with every test green, depending only on how busy the
 * machine was. Here every face is ready at once, which is what the app's own fallback assumes
 * (`useAppFonts`: an error still resolves, never a blank app).
 */
export default class FontFaceObserver {
  constructor(public readonly family: string) {}
  load(): Promise<this> {
    return Promise.resolve(this);
  }
}

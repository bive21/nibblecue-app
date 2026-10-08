// the boot log first of all (src/app/boot.ts): the terminal has a line before anything else
// in the bundle evaluates, so a bundle that dies evaluating dies after it
import { crumb } from './src/app/boot';
// crypto.getRandomValues for supabase-js and the id generator, before anything else loads
import 'react-native-get-random-values';
// and crypto.subtle.digest onto that same object, so sign-in links use PKCE's S256, not plain
// (src/lib/subtleDigest.ts)
import './src/lib/webCrypto';
import { registerRootComponent } from 'expo';

import App from './App';

crumb('bundle evaluated; registering the root component');

// registerRootComponent calls AppRegistry.registerComponent('main', () => App).
// It also sets the environment up correctly whether the app runs in Expo Go or in a
// native (dev client) build.
registerRootComponent(App);

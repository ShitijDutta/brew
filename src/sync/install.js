/* Runs before the app: if a GitHub connection is saved on this device, the app syncs through it. */
import { installGithubDb } from './github.js';
installGithubDb();

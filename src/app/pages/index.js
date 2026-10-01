import { homePage } from './homePage.js';
import { settingsPage } from './settings.js';
import { creatorPage } from './creator.js';
import { garagePage } from './garage.js';
import { vehiclesPage } from './vehicles.js';
import { shopPage } from './shop.js';
import { auctionPage } from './auction.js';
import { raceEditorPage } from './raceEditor.js';
import { worldPage } from './world.js';
import { missionsPage } from './missionsPage.js';
import { eventsPage } from './passEvents.js';
import { seasonPage as passPage } from './seasonPass.js';
import { profilePage, achievementsPage, collectionPage, safehousePage } from './profileEtc.js';
import { friendsPage, multiplayerPage, crewsPage, leaderboardsPage } from './social.js';
import { h } from '../ui.js';

const phonePage = { title: 'Phone', render: (app) => ({ el: h('div', { class: 'col' }, h('div', { class: 'empty' }, 'Open the phone in the world with P.'), h('button', { class: 'btn primary', style: 'align-self:center', on: { click: () => app.closeMenu() } }, 'Back to the world')) }) };

export function registerPages(menu) {
  const pages = { home: homePage, world: worldPage, missions: missionsPage, garage: garagePage, vehicles: vehiclesPage, shop: shopPage, auction: auctionPage, pass: passPage, events: eventsPage, friends: friendsPage, multiplayer: multiplayerPage, crews: crewsPage, leaderboards: leaderboardsPage, profile: profilePage, achievements: achievementsPage, collection: collectionPage, safehouse: safehousePage, phone: phonePage, settings: settingsPage, creator: creatorPage, raceEditor: raceEditorPage };
  for (const [id, def] of Object.entries(pages)) menu.register(id, def);
}

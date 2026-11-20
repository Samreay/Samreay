import soulRelic from '../../content/reviews/soul_relic/cover.jpg';
import scionOfStorms from '../assets/landing/2_Scion_of_Storms.jpg';
import sanctuary from '../assets/landing/3_Sanctuary.jpg';
import shieldsmith from '../assets/landing/4_Shieldsmith.jpg';
import siegebreaker from '../assets/landing/5_siegebreaker.jpg';
import sovereign from '../assets/landing/6_sovereign.jpg';

export const seriesName = 'Manifestation';
export const books = [
  {
    "name": "Soul Relic",
    "cover": soulRelic,
    "volume": 1,
    "link": "https://mybook.to/SoulRelic",
    "audible": "https://www.audible.com/pd/Soul-Relic-Audiobook/B0BTZTNQZM",
    "css": "red"
  },
  {
    "name": "Scion of Storms",
    "cover": scionOfStorms,
    "volume": 2,
    "link": "https://mybook.to/scion_of_storms",
    "paperback": "https://www.amazon.com/dp/B0BYBF7YDB",
    "css": "blue"
  },
  {
    "name": "Sanctuary",
    "cover": sanctuary,
    "volume": 3,
    "link": "https://mybook.to/hinton_sanctuary",
    "css": "purple"
  },
  {
    "name": "Shieldsmith",
    "cover": shieldsmith,
    "volume": 4,
    "link": "https://mybook.to/shieldsmith",
    "css": "green"
  },
  {
    "name": "Siegebreaker",
    "cover": siegebreaker,
    "volume": 5,
    "link": "https://mybook.to/Siegebreaker",
    "css": "blue"
  },
  {
    "name": "Sovereign",
    "cover": sovereign,
    "volume": 6,
    "link": "https://mybook.to/SoulRelic",
    "css": "purple"
  }
] as const;

export default books;

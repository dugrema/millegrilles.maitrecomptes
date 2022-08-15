import i18n from 'i18next';
import Backend from 'i18next-http-backend';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';
import moment from 'moment'

function formatterValeur(value, format, lng) {
  if(value instanceof Date) {
    return moment(value).locale(lng).format(format)
  } else if(!isNaN(value) && !isNaN(format)) {
    return Number(value).toFixed(format)
  }

  return value;
}

i18n
  // load translation using http -> see /public/locales
  // learn more: https://github.com/i18next/i18next-http-backend
  .use(Backend)
  // detect user language
  // learn more: https://github.com/i18next/i18next-browser-languageDetector
  .use(LanguageDetector)
  // pass the i18n instance to react-i18next.
  .use(initReactI18next)
  // init i18next
  // for all options read: https://www.i18next.com/overview/configuration-options
  .init({
    fallbackLng: 'fr',
    debug: true,

    backend: {
      loadPath: '/millegrilles/locales/{{lng}}/{{ns}}.json',
    },

    interpolation: {
      escapeValue: false, // not needed for react as it escapes by default
      format: formatterValeur,
    },
  });

export default i18n;
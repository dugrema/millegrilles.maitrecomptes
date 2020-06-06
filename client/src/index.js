import React from 'react'
import ReactDOM from 'react-dom'
import {BrowserRouter as Router, Route} from 'react-router-dom'

import './index.css'
import App from './containers/App'
import * as serviceWorker from './serviceWorker'

import 'bootstrap/dist/css/bootstrap.min.css'
import 'font-awesome/css/font-awesome.min.css'
import './components/i18n'

// function useRedirectUrl(props) {
//   const search = new URLSearchParams(useLocation().search);
//   return search.get('url');
// }
//

ReactDOM.render(
  <React.StrictMode>
    <Router basename={'/millegrilles'}>
      <Route path='/' component={App} />
    </Router>
  </React.StrictMode>,
  document.getElementById('root')
);

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://bit.ly/CRA-PWA
serviceWorker.unregister();

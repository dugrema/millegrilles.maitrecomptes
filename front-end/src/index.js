import React from 'react';
import ReactDOM from 'react-dom';
import {BrowserRouter as Router, Route, useLocation} from 'react-router-dom';

import './index.css';
import App from './App';
import * as serviceWorker from './serviceWorker';

function useQuery() {
  const search = new URLSearchParams(useLocation().search);
  return search.get('url');
}

ReactDOM.render(
  <React.StrictMode>
    <Router basename={'/millegrilles'}>
      <Route path='/'>
        <App query={useQuery}/>
      </Route>
    </Router>
  </React.StrictMode>,
  document.getElementById('root')
);

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://bit.ly/CRA-PWA
serviceWorker.unregister();

import {StrictMode, Suspense, lazy} from 'react';
import {createRoot} from 'react-dom/client';

// // Importer JS global
// import 'react-bootstrap/dist/react-bootstrap.min.js'

// // Importer cascade CSS global
// import 'bootstrap/dist/css/bootstrap.min.css'
// import 'font-awesome/css/font-awesome.min.css'
// import '@dugrema/millegrilles.reactjs/dist/index.css'
import './index.css'

//import App from './App2'
const App = lazy(()=>import('./App2'))

const root = createRoot(document.getElementById('root'));
root.render(
  <StrictMode>
    <Suspense fallback={<Loading />}>
      <App />
    </Suspense>
  </StrictMode>
);

function Loading(props) {
  return (
    <div>
      <h1>Preparation de la MilleGrille</h1>
      <p>Veuillez patienter durant le chargement de la page.</p>
      <ol>
        <li>Initialisation</li>
        <li>Chargement des composants dynamiques</li>
      </ol>
    </div>
  )
}
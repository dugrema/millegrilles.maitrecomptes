import {StrictMode, Suspense, lazy} from 'react';
import {createRoot} from 'react-dom/client';
import ErrorBoundary from './ErrorBoundary';

// Importer JS global
import 'react-bootstrap/dist/react-bootstrap.min.js'

// Importer cascade CSS global
import 'bootstrap/dist/css/bootstrap.min.css'
import 'font-awesome/css/font-awesome.min.css'
import '@dugrema/millegrilles.reactjs/dist/index.css'

const App = lazy(()=>import('./App2'))

const root = createRoot(document.getElementById('root'));
const loading = <Loading />
root.render(
  <StrictMode>
    <Suspense fallback={loading}>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </Suspense>
  </StrictMode>
);

function Loading(props) {
  return (
    <div>
      <div className="navinit">
        <nav>
          <span>MilleGrilles</span>
        </nav>
      </div>

      <p className="titleinit">Preparation de la MilleGrille</p>
      <p>Veuillez patienter durant le chargement de la page.</p>
      <ol>
        <li>Initialisation</li>
        <li>Chargement des composants dynamiques</li>
      </ol>
    </div>
  )
}

// Run once
document.getElementById('splash_init2').className = ''

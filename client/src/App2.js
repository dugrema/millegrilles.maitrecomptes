import { lazy, useState, useCallback, Suspense } from 'react'
import { useTranslation } from 'react-i18next'

import Container from 'react-bootstrap/Container'

import i18n from './i18n'

import { ModalAttente, LayoutMillegrilles, ModalErreur, initI18n } from '@dugrema/millegrilles.reactjs'
import useWorkers, {useEtatConnexion, WorkerProvider, useEtatPret, useInfoConnexion } from './WorkerContext'
import ErrorBoundary from './ErrorBoundary'

// Importer JS global
import 'react-bootstrap/dist/react-bootstrap.min.js'

// Importer cascade CSS global
import 'bootstrap/dist/css/bootstrap.min.css'
import 'font-awesome/css/font-awesome.min.css'
import '@dugrema/millegrilles.reactjs/dist/index.css'

import './index.scss'
import './App.css'

// Wire i18n dans module @dugrema/millegrilles.reactjs
initI18n(i18n)

const MenuApp = lazy( () => import('./Menu') )
const PreAuthentifier = lazy( () => import('./PreAuthentifier') )
const Accueil = lazy( () => import('./Accueil') )
const SectionActiverDelegation = lazy( () => import('./ActiverDelegation') )
const SectionActiverCompte = lazy( () => import('./ActiverCompte') )
const SectionAjouterMethode = lazy( () => import('./AjouterMethode') )

function App() {
  
    return (
      <WorkerProvider attente={<Attente />}>
        <ErrorBoundary>
          <Suspense fallback={<Attente />}>
            <AppTop />
          </Suspense>
        </ErrorBoundary>
      </WorkerProvider>
    )
  
}
export default App

function AppTop(_props) {

    const { t, i18n } = useTranslation()

    const workers = useWorkers()
    const etatConnexion = useEtatConnexion()
    const infoConnexion = useInfoConnexion()

    // Callbacks worker connexion, permet de connaitre l'etat du worker
    const [etatUsagerBackend, setEtatUsagerBackend] = useState('')  // Info serveur pre-auth pour nomUsager

    // Conserver la plus recente info de pk/date delegation (pour nouveau cert)
    const [resultatAuthentificationUsager, setResultatAuthentificationUsager] = useState('')

    const [sectionAfficher, setSectionAfficher] = useState('')

    // Messages, erreurs
    const [attente, setAttente] = useState(false)
    const [error, setError] = useState('')
    const erreurCb = useCallback((err, message)=>{
        console.error("Erreur ", err)
        setError({err, message})
    }, [setError])
    const handlerCloseErreur = () => setError('')

    const menu = (
        <MenuApp 
            i18n={i18n} 
            etatConnexion={etatConnexion} 
            idmg={infoConnexion.idmg}
            workers={workers} 
            setSectionAfficher={setSectionAfficher} />
    ) 

    return (
        <LayoutMillegrilles menu={menu}>

            <Container className="contenu">

                <Suspense fallback={<Attente2 />}>
                    <Contenu 
                        setResultatAuthentificationUsager={setResultatAuthentificationUsager}
                        resultatAuthentificationUsager={resultatAuthentificationUsager}
                        erreurCb={erreurCb}
                        sectionAfficher={sectionAfficher}
                        setSectionAfficher={setSectionAfficher}
                        etatUsagerBackend={etatUsagerBackend}
                        setEtatUsagerBackend={setEtatUsagerBackend}
                    />
                </Suspense>

            </Container>

            <ModalAttente show={attente} setAttente={setAttente} />
            <ModalErreur show={!!error} err={error.err} message={error.message} titre={t('Erreur.titre')} fermer={handlerCloseErreur} />

        </LayoutMillegrilles>
    )
}

function Attente(_props) {

    return (
        <div>
            <p className="titleinit">Preparation de la MilleGrille</p>
            <p>Veuillez patienter durant le chargement de la page.</p>
            <ol>
                <li>Initialisation</li>
                <li>Chargement des composants dynamiques</li>
                <li>Connexion a la page</li>
            </ol>
        </div>
    )
}

function Attente2(_props) {

    const etatConnexion = useEtatConnexion()

    console.debug("Attente2 etatConnexion ", etatConnexion)

    return (
        <div>
            <p className="titleinit">Preparation de la MilleGrille</p>
            <p>Veuillez patienter durant le chargement de la page.</p>
            <ol>
                <li>Initialisation</li>
                <li>Chargement des composants dynamiques</li>
                <li>Connexion a la page</li>
                {etatConnexion?<li>Connecte</li>:''}
            </ol>
        </div>
    )
}

function Contenu(props) {
    const { 
        sectionAfficher, setSectionAfficher, 
        resultatAuthentificationUsager,
        setResultatAuthentificationUsager,
        etatUsagerBackend, setEtatUsagerBackend,
        erreurCb, 
    } = props

    const etatPret = useEtatPret()
    const etatConnexion = useEtatConnexion()

    // Flag pour conserver l'etat "authentifie" lors d'une perte de connexion
    const [connexionPerdue, setConnexionPerdue] = useState(false)

    const handleFermerSection = useCallback(()=>setSectionAfficher(''), [setSectionAfficher])

    if(!etatConnexion) return <Attente2 {...props} />

    // Selection de la page a afficher
    let Page = PreAuthentifier
    if(etatPret || connexionPerdue) {
        switch(sectionAfficher) {
            case 'SectionActiverDelegation': Page = SectionActiverDelegation; break
            case 'SectionActiverCompte': Page = SectionActiverCompte; break
            case 'SectionAjouterMethode': Page = SectionAjouterMethode; break
            default: Page = Accueil
        }
    }
  
    return (
        <Page
            fermer={handleFermerSection} 
            resultatAuthentificationUsager={resultatAuthentificationUsager}
            setResultatAuthentificationUsager={setResultatAuthentificationUsager}
            etatUsagerBackend={etatUsagerBackend}
            setEtatUsagerBackend={setEtatUsagerBackend}
            erreurCb={erreurCb} />
    )
}

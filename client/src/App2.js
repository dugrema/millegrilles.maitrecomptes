import { lazy, useState, useCallback, useMemo, Suspense, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import Container from 'react-bootstrap/Container'

import i18n from './i18n'

import { ModalAttente, LayoutMillegrilles, ModalErreur, initI18n } from '@dugrema/millegrilles.reactjs'
import {useEtatConnexion, WorkerProvider, useEtatPret } from './WorkerContext'
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
            setSectionAfficher={setSectionAfficher} />
    ) 

    return (
        <LayoutMillegrilles menu={menu}>

            <Container className="contenu">

                <Suspense fallback={<Attente2 />}>
                    <Contenu 
                        erreurCb={erreurCb}
                        sectionAfficher={sectionAfficher}
                        setSectionAfficher={setSectionAfficher}
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
    const { sectionAfficher, setSectionAfficher, erreurCb } = props

    const etatPret = useEtatPret()
    const etatConnexion = useEtatConnexion()

    // Flag pour conserver l'etat "authentifie" lors d'une perte de connexion
    const [connexionPerdue, setConnexionPerdue] = useState(false)

    // Information du compte usager sur le serveur
    const [compteUsagerServeur, setCompteUsagerServeur] = useState('')

    const handleFermerSection = useCallback(()=>setSectionAfficher(''), [setSectionAfficher])

    useEffect(()=>{
        console.debug("Changement etat compteUsagerServeur ", compteUsagerServeur)
    }, [compteUsagerServeur])

    // Selection de la page a afficher
    const Page = useMemo(()=>{
        if(etatPret || connexionPerdue) {
            switch(sectionAfficher) {
                case 'SectionActiverDelegation': return SectionActiverDelegation
                case 'SectionActiverCompte': return SectionActiverCompte
                case 'SectionAjouterMethode': return SectionAjouterMethode
                default: return Accueil
            }
        }
        return PreAuthentifier
    }, [sectionAfficher, etatPret, connexionPerdue])
  
    if(!etatConnexion) return <Attente2 {...props} />

    return (
        <Page
            fermer={handleFermerSection} 
            compteUsagerServeur={compteUsagerServeur}
            setCompteUsagerServeur={setCompteUsagerServeur}
            erreurCb={erreurCb} />
    )
}

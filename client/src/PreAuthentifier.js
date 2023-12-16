import axios from 'axios'
import {useEffect, useState, useCallback, useMemo, useRef} from 'react'
import {proxy as comlinkProxy} from 'comlink'

import Row from 'react-bootstrap/Row'
import Col from 'react-bootstrap/Col'
import Button from 'react-bootstrap/Button'
import Form from 'react-bootstrap/Form'
import Alert from 'react-bootstrap/Alert'
import Overlay from 'react-bootstrap/Overlay'

import { Trans, useTranslation } from 'react-i18next'

import { MESSAGE_KINDS } from '@dugrema/millegrilles.utiljs/src/constantes'
import { BoutonActif, usagerDao } from '@dugrema/millegrilles.reactjs'

import useWorkers, {
    useEtatConnexion, useFormatteurPret, useEtatPret, 
    useEtatSessionActive, useSetEtatSessionActive, useSetUsager,
    useUsagerDb, useUsagerWebAuth
} from './WorkerContext'

import { BoutonAuthentifierWebauthn } from './WebAuthn'
import { RenderCsr } from './QrCodes'

import { sauvegarderCertificatPem, initialiserCompteUsager, preparerUsager, chargerUsager } from './comptesUtil'

function PreAuthentifier(props) {
    const { erreurCb } = props

    return (
        <Row>
            <Col xs={0} sm={1} md={2} lg={3}></Col>
            <Col xs={12} sm={10} md={8} lg={6}>
                <p></p>
                <SectionAuthentification
                    erreurCb={erreurCb}
                />
            </Col>
        </Row>
    )
}

export default PreAuthentifier

function SectionAuthentification(props) {
    const { erreurCb } = props

    const workers = useWorkers()

    const [usagerDb, setUsagerDb] = useUsagerDb()
    const [usagerWebAuth, setUsagerWebAuth] = useUsagerWebAuth()

    const [nomUsager, setNomUsager] = useState(window.localStorage.getItem('usager')||'')
    const [dureeSession, setDureeSession] = useState(window.localStorage.getItem('dureeSession')||'86400')

    // Flags
    const [nouvelUsager, setNouvelUsager] = useState(false)  // Flag pour bouton nouvel usager
    const [authentifier, setAuthentifier] = useState(false)  // Flag pour ecran inscrire/authentifier
    const [attente, setAttente] = useState(false)
    const [compteRecovery, setCompteRecovery] = useState(false)  // Mode pour utiliser un code pour associer compte

    const reloadCompteUsager = useCallback(()=>{
        if(nomUsager) {
            setUsagerDb('')
            setNomUsager('')
            setNouvelUsager(false)
            setAuthentifier(true)
            setCompteRecovery(false)
            setNomUsager(nomUsager)
        }
    }, [nomUsager, setNomUsager, setAuthentifier, setCompteRecovery, setUsagerDb, setNouvelUsager])

    // Load/re-load usagerDbLocal et usagerWebAuth sur changement de nomUsager
    useEffect(()=>{
        if(!nomUsager) return
        setUsagerWebAuth('')
        if(!usagerDb || usagerDb.nomUsager !== nomUsager) {
            initialiserCompteUsager(nomUsager) 
                .then(async usagerLocal=>{
                    setUsagerDb(usagerLocal)
                    // console.debug("SectionAuthentification initialiserCompteUsager usagerLocal : %O", usagerLocal)
                    const requete = usagerLocal.requete || {},
                          fingerprintPk = requete.fingerprintPk,
                          fingerprintCourant = usagerLocal.fingerprintPk

                    if(usagerLocal.certificat && usagerLocal.clePriveePem) {
                        // Initialiser le formatteur de certificat - va permettre auth via activation
                        await chargerFormatteurCertificat(workers, usagerLocal)
                    } else {
                        // Desactiver formatteur de certificat
                        await chargerFormatteurCertificat(workers, {})
                    }

                    const reponseUsagerWebAuth = await chargerUsager(
                        nomUsager, fingerprintPk, fingerprintCourant, {genererChallenge: true})
                    // console.debug("SectionAuthentification Charge compte usager : %O", reponseUsagerWebAuth)

                    // Recuperer nouveau certificat
                    if(usagerLocal.requete && reponseUsagerWebAuth.infoUsager && reponseUsagerWebAuth.infoUsager.certificat) {
                        console.info("Nouveau certificat recu : %O", reponseUsagerWebAuth.infoUsager)
                        // TODO : ajouter delegations_date, delegations_versions a la reponse webauth
                        const reponse = {...reponseUsagerWebAuth.infoUsager, nomUsager}
                        const usagerLocalMaj = await sauvegarderUsagerMaj(workers, reponse)
                        // Reload le formatteur de messages avec le nouveau certificat
                        await chargerFormatteurCertificat(workers, usagerLocalMaj)
                    }

                    setUsagerWebAuth(reponseUsagerWebAuth)
                })
                .catch(erreurCb)
        }
    }, [workers, nomUsager, usagerDb, setUsagerDb, setUsagerWebAuth, erreurCb])

    if(compteRecovery) {
        // Etape = CompteRecovery
        return (
            <CompteRecovery 
                setAuthentifier={setAuthentifier}
                setCompteRecovery={setCompteRecovery}
                reloadCompteUsager={reloadCompteUsager}
                erreurCb={erreurCb}
                />
        )
    }

    if(authentifier && usagerWebAuth) {
        console.debug("Authentifier avec : %O", usagerWebAuth)

        if(usagerWebAuth.infoUsager) {
            // C'est un usager existant, on poursuit l'authentification avec webauthn
            return (
                <Authentifier 
                    nouvelUsager={nouvelUsager}
                    setAttente={setAttente}
                    nomUsager={nomUsager}
                    dureeSession={dureeSession}
                    setAuthentifier={setAuthentifier}
                    setCompteRecovery={setCompteRecovery}
                    erreurCb={erreurCb}
                    />
            )

        } else {
            // Nouvel usager
            return (
                <InscrireUsager 
                    setAuthentifier={setAuthentifier}
                    setNouvelUsager={setNouvelUsager}
                    reloadCompteUsager={reloadCompteUsager}
                    setNomUsager={setNomUsager}
                    nomUsager={nomUsager}
                    erreurCb={erreurCb}
                    />
            )
        }

    }

    // Ecran de saisie du nom usager
    return (
        <FormSelectionnerUsager 
            nomUsager={nomUsager}
            setNomUsager={setNomUsager}
            nouvelUsager={nouvelUsager}
            setNouvelUsager={setNouvelUsager}
            attente={attente}
            setAttente={setAttente}
            setAuthentifier={setAuthentifier}
            setCompteRecovery={setCompteRecovery}
            dureeSession={dureeSession}
            setDureeSession={setDureeSession}
            erreurCb={erreurCb}
            />
    )

    
//     const { erreurCb } = props

//     const workers = useWorkers(),
//           etatConnexion = useEtatConnexion(),
//           setUsager = useSetUsager()

//     // Information du compte usager sur le serveur, challenges (webauthn/certificat)
//     const [compteUsagerServeur, setCompteUsagerServeur] = useState('')

//     // Information usager temporaire pour auth
//     const [usagerDbLocal, setUsagerDbLocal] = useState('')          // Info db locale pre-auth pour nomUsager

//     const setUsagerDbLocalCb = useCallback(usager=>{
//         setUsagerDbLocal(usager)
//         setUsager(usager)
//     }, [setUsagerDbLocal])

//     const [listeUsagers, setListeUsagers] = useState('')
//     const [nomUsager, setNomUsager] = useState(window.localStorage.getItem('usager')||'')
//     const [dureeSession, setDureeSession] = useState(window.localStorage.getItem('dureeSession')||'86400')

//     // Flags
//     const [nouvelUsager, setNouvelUsager] = useState(false)  // Flag pour bouton nouvel usager
//     const [authentifier, setAuthentifier] = useState(false)  // Flag pour ecran inscrire/authentifier
//     const [attente, setAttente] = useState(false)
//     const [compteRecovery, setCompteRecovery] = useState(false)  // Mode pour utiliser un code pour associer compte

//     const evenementFingerprintPkCb = useCallback(evenement=>{
//         const { connexion } = workers
        
//         console.debug("Recu message evenementFingerprintPkCb : %O", evenement)
//         const { message } = evenement || {},
//               { certificat } = message
//         const { nomUsager, requete } = usagerDbLocal
//         if(certificat && requete) {
//             const { clePriveePem, fingerprintPk } = requete
//             sauvegarderCertificatPem(nomUsager, certificat, {clePriveePem, fingerprintPk})
//                 .then(async ()=>{
//                     const usagerMaj = await usagerDao.getUsager(nomUsager)
//                     const nouvelleInfoBackend = await chargerUsager(connexion, nomUsager, null, fingerprintPk)

//                     // Revenir a l'ecran d'authentification
//                     setCompteRecovery(false)

//                     // Pour eviter cycle, on fait sortir de l'ecran en premier. Set Usager ensuite.
//                     setCompteUsagerServeur(nouvelleInfoBackend)
//                     setUsagerDbLocalCb(usagerMaj)

//                     setAuthentifier(true)
//                     return workers.connexion.onConnect()
//                 })
//                 .catch(err=>erreurCb(err, "Erreur de sauvegarde du nouveau certificat, veuillez cliquer sur Retour et essayer a nouveau."))
//         } else {
//             console.warn("Recu message evenementFingerprintPkCb sans certificat %O ou requete locale vide %O", evenement, requete)
//             erreurCb("Erreur de sauvegarde du nouveau certificat, veuillez cliquer sur Retour et essayer a nouveau.")
//         }
//     }, [
//         workers, usagerDbLocal, 
//         setAuthentifier, setCompteRecovery, setCompteUsagerServeur, setUsagerDbLocalCb,
//         erreurCb,
//     ])

//     const requete = usagerDbLocal.requete || {},
//           fingerprintPk = requete.fingerprintPk

//     useEffect(()=>{
//         usagerDao.getListeUsagers()
//             .then(usagers=>{
//                 if(usagers.length === 0) setNouvelUsager(true)
//                 usagers.sort()  // Trier liste par nom
//                 setListeUsagers(usagers)
//             })
//             .catch(err=>erreurCb(err))
//     }, [setListeUsagers, setNouvelUsager, erreurCb])

//     // Load/re-load usagerDbLocal sur changement de nomUsager
//     useEffect(()=>{
//         if(!nomUsager) return
//         if(!usagerDbLocal || usagerDbLocal.nomUsager !== nomUsager) {
//             initialiserCompteUsager(nomUsager) 
//                 .then(usagerLocal=>{
//                     setUsagerDbLocalCb(usagerLocal)
//                     console.debug("SetUsagerDbLocal : %O", usagerLocal)
//                 })
//                 .catch(erreurCb)
//         }
//     }, [nomUsager, usagerDbLocal, setUsagerDbLocalCb, erreurCb])

//     useEffect(()=>{
//         // if(!etatConnexion) return
//         // const { connexion } = workers
//         // if(fingerprintPk) {
//         //     // Activer listener
//         //     const cb = comlinkProxy(evenementFingerprintPkCb)
//         //     console.debug("Ajouter listening fingerprints : %s", fingerprintPk)
//         //     connexion.enregistrerCallbackEvenementsActivationFingerprint(fingerprintPk, cb)
//         //         .then(()=>{
//         //             workers.connexion.getInfoUsager(nomUsager, fingerprintPk).then(reponse=>{
//         //                 console.debug("Information usager : ", reponse)
//         //                 if(reponse.certificat) {
//         //                     evenementFingerprintPkCb({message: reponse})
//         //                         .catch(err=>console.error("Erreur recuperation certificat usager : ", err))
//         //                 }
//         //             })
//         //             .catch(err=>console.info("Erreur chargement information certificat usager : ", err))
//         //         })
//         //         .catch(err=>erreurCb(err))
//         //     return () => {
//         //         console.debug("Retrait listening fingerprints : %s", fingerprintPk)
//         //         connexion.retirerCallbackEvenementsActivationFingerprint(fingerprintPk, cb)
//         //             .catch(err=>console.warn("Erreur retrait evenement fingerprints : %O", err))
//         //     }
//         // }
//     }, [workers, etatConnexion, nomUsager, fingerprintPk, evenementFingerprintPkCb, erreurCb])

//     if(compteRecovery) {
//         // Etape = CompteRecovery
//         return (
//             <CompteRecovery 
//                 usagerDbLocal={usagerDbLocal}
//                 setUsagerDbLocal={setUsagerDbLocalCb}
//                 compteUsagerServeur={compteUsagerServeur}
//                 setCompteUsagerServeur={setCompteUsagerServeur}
//                 setAuthentifier={setAuthentifier}
//                 setCompteRecovery={setCompteRecovery}
//                 erreurCb={erreurCb}
//                 />
//         )
//     } else if(authentifier) {
//         if(compteUsagerServeur && compteUsagerServeur.infoUsager) {
//             if(compteUsagerServeur.infoUsager.compteUsager === false) {
//                 // Etape = InscrireUsager
//                 return (
//                     <InscrireUsager 
//                         setAuthentifier={setAuthentifier}
//                         nomUsager={nomUsager}
//                         setUsagerDbLocal={setUsagerDbLocalCb}
//                         erreurCb={erreurCb}
//                         />
//                 )
//             } else {
//                 // Etape = Authentifier
//                 return (
//                     <Authentifier 
//                         nouvelUsager={nouvelUsager}
//                         setAttente={setAttente}
//                         nomUsager={nomUsager}
//                         dureeSession={dureeSession}
//                         usagerDbLocal={usagerDbLocal}
//                         setAuthentifier={setAuthentifier}
//                         etatUsagerBackend={compteUsagerServeur}
//                         setEtatUsagerBackend={setCompteUsagerServeur}
//                         setCompteRecovery={setCompteRecovery}
//                         erreurCb={erreurCb}
//                         />
//                 )
//             }
//         }
//     } else {
//         // Etape = FormSelectionnerUsager
//         return (
//             <FormSelectionnerUsager 
//                 nomUsager={nomUsager}
//                 setNomUsager={setNomUsager}
//                 nouvelUsager={nouvelUsager}
//                 setNouvelUsager={setNouvelUsager}
//                 attente={attente}
//                 setAttente={setAttente}
//                 setAuthentifier={setAuthentifier}
//                 listeUsagers={listeUsagers}
//                 setCompteRecovery={setCompteRecovery}
//                 etatUsagerBackend={compteUsagerServeur}
//                 setEtatUsagerBackend={setCompteUsagerServeur}
//                 usagerDbLocal={usagerDbLocal}
//                 setUsagerDbLocal={setUsagerDbLocalCb}
//                 dureeSession={dureeSession}
//                 setDureeSession={setDureeSession}
//                 erreurCb={erreurCb}
//                 />
//         )
//     }

}

function CompteRecovery(props) {
    const { 
        // usagerDbLocal, setUsagerDbLocal, 
        // compteUsagerServeur, setCompteUsagerServeur, 
        setAuthentifier, setCompteRecovery,
        reloadCompteUsager,
        erreurCb,
    } = props

    const { t } = useTranslation()

    const workers = useWorkers()
    const [usagerDb, setUsagerDb] = useUsagerDb()
//           etatConnexion = useEtatConnexion()

//     // const usagerDbLocal = useMemo(()=>{return props.usagerDbLocal || {}}, [props.usagerDbLocal])

    const requete = usagerDb.requete || {},
          nomUsager = usagerDb.nomUsager,
          csr = requete.csr,
          fingerprintPk = requete.fingerprintPk

    console.debug("CompteRecovery usagerDb ", usagerDb)

    const refBoutonCodeActivation = useRef()
    const refBoutonCsrCopie = useRef()

    const [code, setCode] = useState('')
    const [showCodeCopie, setShowCodeCopie] = useState(false)
    const [showCsrCopie, setShowCsrCopie] = useState(false)

    const activationFingerprintCb = useCallback( e => {
        console.debug("activationFingerprintCb Event : ", e)
        
        // Authentifier automatiquement avec le nouveau certificat
        reloadCompteUsager()
    }, [reloadCompteUsager, workers])
    const activationFingerprintCbProxy = useMemo(()=>comlinkProxy(activationFingerprintCb), [activationFingerprintCb])

    useEffect(()=>{
        if(showCodeCopie) {
            const timeout = setTimeout(()=>setShowCodeCopie(false), 5_000)
            return () => clearTimeout(timeout)
        }
    }, [showCodeCopie, setShowCodeCopie])

    useEffect(()=>{
        if(showCsrCopie) {
            const timeout = setTimeout(()=>setShowCsrCopie(false), 5_000)
            return () => clearTimeout(timeout)
        }
    }, [showCsrCopie, setShowCsrCopie])

//     const webAuthnSuccessHandler = useCallback(resultat=>{
//         setCompteRecovery(false)
//         console.debug("webAuthnSuccessHandler compteUsagerServeur: ", compteUsagerServeur)
//         const params = {...resultat, nomUsager: compteUsagerServeur.nomUsager}
//         sauvegarderUsagerMaj(workers, params)
//             .catch(erreurCb)
//     }, [workers, compteUsagerServeur, setCompteRecovery])

    const erreurAuthCb = useCallback((err, message)=>{
        if(err && ![0, 11, 20].includes(err.code)) {
            erreurCb(err, message)
        } else {
            erreurCb("Erreur authentification annulee ou mauvaise cle")
        }
    }, [erreurCb])

    const retourCb = useCallback(()=>{
        setAuthentifier(false)
        setCompteRecovery(false)
    }, [setAuthentifier, setCompteRecovery])

    const copierCodeHandler = useCallback(()=>{
        navigator.clipboard.writeText(code)
            .then(()=>{
                setShowCodeCopie(true)
            })
            .catch(erreurCb)
    }, [code, setShowCodeCopie, erreurCb])

    const copierCsr = useCallback(()=>{
        navigator.clipboard.writeText(csr)
            .then(()=>{
                setShowCsrCopie(true)
            })
            .catch(erreurCb)
    }, [csr, setShowCsrCopie])

    // Generer nouveau CSR
    useEffect(()=>{
        const { requete } = usagerDb
        if(nomUsager) {
            // S'assurer qu'on une requete ou le bon compte
            if(!requete) {
                console.debug("Generer nouveau CSR")
                initialiserCompteUsager(nomUsager, {regenerer: true})
                    .then(usager=>{
                        setUsagerDb(usager)
                        return ajouterCsrRecovery(workers, usager)
                    })
                    .catch(err=>erreurCb(err))
            } else {
                ajouterCsrRecovery(workers, usagerDb)
                    .catch(err=>erreurCb(err))
            }
        }
    }, [workers, nomUsager, usagerDb, setUsagerDb, erreurCb])

    useEffect(()=>{
        if(fingerprintPk) {
            let codeComplet = fingerprintPk.slice(fingerprintPk.length-8)
            codeComplet = codeComplet.toLowerCase()
            codeComplet = [codeComplet.slice(0,4), codeComplet.slice(4,8)].join('-')
            setCode(codeComplet)

            // Enregistrer listener d'activation du fingerprint
            console.debug("Enregistrer listener pour fingperintPk %s", fingerprintPk)
            workers.connexion.enregistrerCallbackEvenementsActivationFingerprint(fingerprintPk, activationFingerprintCbProxy)
                .catch(err=>console.error("Erreur enregistrerCallbackEvenementsActivationFingerprint ", err))
            return () => {
                console.debug("Retirer listener pour fingperintPk %s", fingerprintPk)
                workers.connexion.retirerCallbackEvenementsActivationFingerprint(fingerprintPk, activationFingerprintCbProxy)
                    .catch(err=>console.error("Erreur retirerCallbackEvenementsActivationFingerprint ", err))
            }

        } else {
            setCode('')
        }
    }, [workers, activationFingerprintCbProxy, fingerprintPk, setCode])

    return (
        <>
            <Row>
                <Col xs={10} md={11}><h2>{t('Authentification.echec-titre')}</h2></Col>
                <Col xs={2} md={1} className="bouton"><Button onClick={retourCb} variant="secondary"><i className='fa fa-remove'/></Button></Col>
            </Row>

            <p>{t('Authentification.echec-description')}</p>

            <Row>
                <Col xs={12} md={6}>
                    <h4>{t('Authentification.echec-activation-titre')}</h4>
                    <Row>
                        <Col xs={4}>{t('Authentification.echec-activation-champ-code')}</Col>
                        <Col xs={8} className='code-activation'>
                            <Button variant='link' ref={refBoutonCodeActivation} onClick={copierCodeHandler}>{code}</Button>
                        </Col>
                    </Row>
                    <Row>
                        <Col xs={4}>{t('Authentification.echec-activation-champ-compte')}</Col>
                        <Col>{nomUsager}</Col>
                    </Row>
                    <p></p>
                    <p className='code-instructions'>{t('Authentification.echec-activation-instruction1')}</p>
                </Col>

                <Col xs={12} md={6}>
                    <h4>{t('Authentification.echec-codeqr-titre')}</h4>
                    <RenderCsr value={csr} size={200} />
                    <p className='code-instructions'>{t('Authentification.echec-codeqr-instruction')}</p>
                </Col>

                <Col xs={12} md={6} className='no-print'>
                    <h4>{t('Authentification.echec-csr-titre')}</h4>
                    <Button variant='secondary' ref={refBoutonCsrCopie} onClick={copierCsr}>Copier</Button>
                    <p className='code-instructions'>{t('Authentification.echec-csr-instruction')}</p>
                </Col>

                <Col xs={12} md={6} className='no-print'>
                    <h4>{t('Authentification.echec-cle-titre')}</h4>
                    
                    <p className='code-instructions'>{t('Authentification.echec-cle-instruction')}</p>

                    {/* <BoutonAuthentifierWebauthn
                        variant="secondary"
                        challenge={compteUsagerServeur.infoUsager.challengeWebauthn}
                        onSuccess={webAuthnSuccessHandler}
                        onError={erreurAuthCb}
                        usagerDbLocal={usagerDbLocal}
                    >
                        {t('Authentification.echec-cle-bouton')}
                    </BoutonAuthentifierWebauthn>
 */}
                </Col>

            </Row>

            <p></p>

            <Alert variant='secondary'>
                <div><Trans>Authentification.echec-note-securite</Trans></div>
            </Alert>

            <Overlay target={refBoutonCodeActivation} show={showCodeCopie} placement='bottom'>
                <div className='code-activation-overlay'>
                    Code copie avec succes <i className='fa fa-check' />
                </div>
            </Overlay>

            <Overlay target={refBoutonCsrCopie} show={showCsrCopie} placement='right'>
                <div className='code-activation-overlay'>
                    Code copie avec succes <i className='fa fa-check' />
                </div>
            </Overlay>

            <p></p>
        </>
    )
}

function InscrireUsager(props) {
    // console.debug("!! InscrireUsager %O", props)
    const { nomUsager, setAuthentifier, reloadCompteUsager, erreurCb } = props
    const { t } = useTranslation()
    const workers = useWorkers()
    const [usagerDb, setUsagerDb] = useUsagerDb()

    const [etatBouton, setEtatBouton] = useState('')

    const onClickSuivant = useCallback( () => {
        setEtatBouton('attente')
        suivantInscrire(workers, nomUsager, setUsagerDb, erreurCb)
            .then(async () => {
                setEtatBouton('succes')
                reloadCompteUsager()
                await workers.connexion.reconnecter()  // Va authentifier la connexion socket.io avec la session
            })
            .catch(err=>{
                setEtatBouton('echec')
                erreurCb(err)
            })
    }, [workers, nomUsager, setUsagerDb, setEtatBouton, reloadCompteUsager, erreurCb])
    const onClickAnnuler = useCallback( () => setAuthentifier(false), [setAuthentifier])

    return (
        <>
            <h2><Trans>Authentification.creer-compte-titre</Trans></h2>

            <div>
                <p>{t('Authentification.creer-compte-disponible', {nomUsager: props.nomUsager})}</p>

                <p><Trans>Authentification.creer-compte-instructions</Trans></p>

                <Row className="boutons">
                    <Col className="bouton-gauche">
                        <BoutonActif etat={etatBouton} onClick={onClickSuivant}>
                            <Trans>Authentification.bouton-inscrire</Trans>
                        </BoutonActif>
                    </Col>
                    <Col className="bouton-droite">
                        <Button variant="secondary" onClick={onClickAnnuler}>
                            <Trans>Forms.cancel</Trans>
                        </Button>
                    </Col>
                </Row>
            </div>
        </>
    )
}

function Authentifier(props) {

    const {
        nouvelUsager, setAttente, 
        nomUsager, dureeSession,
        // usagerDbLocal, 
        setAuthentifier, 
        // etatUsagerBackend, setEtatUsagerBackend, 
        setCompteRecovery,
        erreurCb
    } = props

    const workers = useWorkers()
    const etatFormatteurPret = useFormatteurPret()

    const usagerDb = useUsagerDb()[0],
          usagerWebAuth = useUsagerWebAuth()[0]

    const challengeWebauthn = useMemo(()=>{
        if(usagerWebAuth && usagerWebAuth.infoUsager) {
            const challenge = usagerWebAuth.infoUsager.authentication_challenge
            console.debug("Authentifier.challengeWebauthn ", challenge)
            return challenge
        }
    }, [usagerWebAuth])

    const onSuccessWebAuth = useCallback(resultat=>{
        console.debug("InputAfficherListeUsagers onSuccessWebAuth ", resultat)

        const params = {...resultat, nomUsager}
        sauvegarderUsagerMaj(workers, params)
            .then(async () => {
                if(!!resultat.auth) {
                    console.info("onSuccessWebAuth Reconnecter %s pour authentification socket.io", nomUsager)
                    // Reconnexion devrait faire setEtatSessionActive(true) via socket.io

                    window.localStorage.setItem('usager', nomUsager)

                    await workers.connexion.reconnecter()
                    await workers.connexion.onConnect()
                } else {
                    console.error("onSuccessWebAuth Echec Authentification ", resultat)
                }
            })
            .catch(erreurCb)
            .finally(()=>setAttente(false))
    }, [workers, nomUsager, setAuthentifier, setAttente])

    // Authentification automatique si applicable
    useEffect(()=>{
        console.debug("Authentifier formatteurPret %s, usagerWebAuth %O", etatFormatteurPret, usagerWebAuth)
        if(!etatFormatteurPret || !usagerWebAuth || !usagerWebAuth.infoUsager) return

        const infoUsager = usagerWebAuth.infoUsager || {}
        const methodesDisponibles = infoUsager.methodesDisponibles
        const challengeCertificat = infoUsager.challenge_certificat
        if(methodesDisponibles.activation && challengeCertificat) {
            console.debug("Authentification avec signature certificat et challenge ", challengeCertificat)

            const data = {certificate_challenge: challengeCertificat}
            workers.connexion.formatterMessage(data, 'auth', {action: 'authentifier_usager', kind: MESSAGE_KINDS.KIND_COMMANDE})
                .then( async messageSigne => {
                    const resultatAuthentification = await axios.post('/auth/authentifier_usager', messageSigne)
                    const contenu = JSON.parse(resultatAuthentification.data.contenu)
                    console.debug("Resultat authentification ", resultatAuthentification)
                    if(!!contenu.auth) {
                        await workers.connexion.reconnecter()
                        await workers.connexion.onConnect()
                        setAuthentifier(false)
                    } else {
                        erreurCb(`Erreur authentification : ${contenu.err}`)
                    }
                })
                .catch(erreurCb)
        }
    }, [workers, etatFormatteurPret, usagerWebAuth, setAuthentifier])

//     const workers = useWorkers(),
//           etatFormatteurPret = useFormatteurPret(),
//           etatPret = useEtatPret()

//     const challengeWebauthn = useMemo(()=>{
//         if(etatUsagerBackend && etatUsagerBackend.infoUsager) {
//             return etatUsagerBackend.infoUsager.authentication_challenge
//         }
//     }, [etatUsagerBackend])

//     const onClickWebAuth = useCallback(resultat=>{
//         console.debug("Authentifier.onClickWebAuthn onclick webauthn %s : %O", nomUsager, resultat)
//         const params = {...resultat, nomUsager}
//         sauvegarderUsagerMaj(workers, params)
//             .catch(erreurCb)
//     }, [workers, nomUsager, erreurCb])

//     // Attendre que le formatteur (certificat) soit pret
//     useEffect(()=>{
//         console.debug("Formatteur pret? %s, usagerDbLocal %O, etat usager back-end : %O", 
//             etatFormatteurPret, usagerDbLocal, etatUsagerBackend)
        
//         if(!usagerDbLocal) return

//         const { connexion } = workers

//         if(!etatFormatteurPret) {
//             chargerFormatteurCertificat(workers, usagerDbLocal).catch(erreurCb)
//         } else if(etatUsagerBackend) {
//             console.debug("onClickWebAuth etatUsagerBackend : ", etatUsagerBackend)
//             // Authentifier
//             const methodesDisponibles = etatUsagerBackend.infoUsager.methodesDisponibles || {}
//             if(methodesDisponibles['certificat']) {
//                 // console.debug("Authentifier avec le certificat")
//                 // connexion.authentifierCertificat(challengeCertificat)
//                 connexion.authentifier()
//                     .then(reponse=>{
//                         console.debug("Reponse authentifier certificat : %O", reponse)
//                         setEtatUsagerBackend(reponse)
//                     })
//                     .catch(err=>{
//                         console.warn("Authentifier: Erreur de connexion : %O", err)
//                         // Note : erreur OK, le compte peut avoir un certificat active dans navigateur tiers
//                         // erreurCb(err, 'Erreur de connexion (authentification du certificat refusee)')
//                     })
//             }
//         } else if(!nouvelUsager && etatPret === false && !usagerDbLocal.certificat) {
//             // On a un certificat absent ou expire
//             // console.info("Certificat absent")
//             setCompteRecovery(true)
//         }
//     }, [
//         workers, etatFormatteurPret, etatPret, nouvelUsager, usagerDbLocal, etatUsagerBackend, 
//         setEtatUsagerBackend, setCompteRecovery, 
//         erreurCb
//     ])

//     // Conserver usager selectionne (pour reload ecran)
//     useEffect(()=>window.localStorage.setItem('usager', nomUsager), [nomUsager])
//     useEffect(()=>{
//         console.debug("Set duree session ", dureeSession)
//         window.localStorage.setItem('dureeSession', dureeSession)
//     }, [dureeSession])

    const recoveryCb = useCallback(()=>setCompteRecovery(true), [setCompteRecovery])
    const annulerCb = useCallback(()=>setAuthentifier(false), [setAuthentifier])

    //     const annulerCb = useCallback(()=>{
//         fermerSession(setAuthentifier, setEtatUsagerBackend)
//             .catch(err=>erreurCb(err))
//     }, [setAuthentifier, setEtatUsagerBackend, erreurCb])

    let message = <p>Ouverture d'une nouvelle session en cours ... <i className="fa fa-spinner fa-spin fa-fw" /></p>
    if(nouvelUsager) message = 'Cliquez sur Suivant pour vous connecter.'
//     else if(!etatPret) message = 'Attente de preparation du certificat'

    return (
        <>
            <Alert variant="info">
                <Alert.Heading>Ouverture de session</Alert.Heading>
                
                {message}
            </Alert>

            <Row>
                <Col className="button-list">
                    {(usagerDb && nouvelUsager)?
                        <BoutonAuthentifierWebauthn 
                            nomUsager={nomUsager}
                            usagerDb={usagerDb}
                            challenge={challengeWebauthn}
                            setAttente={setAttente}
                            onSuccess={onSuccessWebAuth}
                            onError={erreurCb}
                            dureeSession={dureeSession}>
                            Suivant
                        </BoutonAuthentifierWebauthn>
                    :''}
                    <Button variant="secondary" onClick={recoveryCb}>Utiliser un code</Button>
                    <Button variant="secondary" onClick={annulerCb}>Annuler</Button>
                </Col>
            </Row>
        </>
    )
}

function FormSelectionnerUsager(props) {

    const {
        nomUsager, setNomUsager,
        nouvelUsager, setNouvelUsager,
        attente, setAttente,
        setAuthentifier,
        setCompteRecovery,
        dureeSession, setDureeSession,
        erreurCb,
    } = props

    const [listeUsagers, setListeUsagers] = useState('')
    
    const usagerWebAuth = useUsagerWebAuth()[0]

    useEffect(()=>{
        usagerDao.getListeUsagers()
            .then(usagers=>{
                if(usagers.length === 0) setNouvelUsager(true)
                usagers.sort()  // Trier liste par nom
                console.debug("Liste usagers locaux (IDB) ", usagers)
                setListeUsagers(usagers)
            })
            .catch(err=>erreurCb(err))
    }, [setListeUsagers, setNouvelUsager, erreurCb])

//     console.debug("Etat usager backend : ", etatUsagerBackend)

//     const etatUsagerInfo = etatUsagerBackend.infoUsager || {},
//         activation = etatUsagerInfo.activation || {},
//         peutActiver = activation.valide === true
    const peutActiver = useMemo(()=>{
        if(!usagerWebAuth || !usagerWebAuth.infoUsager) return false
        const methodesDisponibles = usagerWebAuth.infoUsager.methodesDisponibles || {}
        return methodesDisponibles.activation || false
    }, [usagerWebAuth])

    if(nouvelUsager) {
        return (
            <Form.Group controlId="formNomUsager">
                <InputSaisirNomUsager 
                    setNomUsager={setNomUsager}
                    setNouvelUsager={setNouvelUsager} 
                    attente={attente}
                    setAttente={setAttente}
                    setAuthentifier={setAuthentifier}
                    setCompteRecovery={setCompteRecovery}
                    peutActiver={peutActiver}
                    dureeSession={dureeSession}
                    setDureeSession={setDureeSession}
                    erreurCb={erreurCb}
                    />
            </Form.Group>
        )
    }

    return (
        <Form.Group controlId="formNomUsager">
            <InputAfficherListeUsagers 
                nomUsager={nomUsager}
                setNomUsager={setNomUsager}
                setNouvelUsager={setNouvelUsager} 
                attente={attente}
                setAttente={setAttente}
                setAuthentifier={setAuthentifier}
                listeUsagers={listeUsagers}
                setCompteRecovery={setCompteRecovery}
                peutActiver={peutActiver}
                dureeSession={dureeSession}
                setDureeSession={setDureeSession}
                erreurCb={erreurCb}
                />
        </Form.Group>
    )
}

function InputSaisirNomUsager(props) {
    const {
        setNomUsager, 
        attente, setAttente, 
        setNouvelUsager, 
        setAuthentifier, 
        erreurCb
    } = props

    const {t} = useTranslation()
    const workers = useWorkers()

    const [nom, setNom] = useState('')
   
    const nomUsagerOnChangeCb = useCallback(event=>setNom(event.currentTarget.value), [setNom])

    const annulerHandler = useCallback(()=>setNouvelUsager(false), [setNouvelUsager])

    const suivantCb = useCallback(
        () => {
            console.debug("BoutonsAuthentifier Suivantcb %s", nom)
            setNomUsager(nom)       // useEffect sur SectionAuthentification va reloader webauth et idb
            setAuthentifier(true)   // Lance l'ecran d'inscription ou login
        }, 
        [workers, nom, setNomUsager, setAttente, setAuthentifier, erreurCb]
    )

    useEffect(()=>{
        workers.connexion.clearFormatteurMessage()
            .catch(err=>console.error("InputSaisirNomUsager Erreur clearFormatteurMessages"))
    }, [workers])
    
    if(!!props.show) return ''

    let loginSansVerification = false  //  TODO FIX ME : peutActiver
    let variantBouton = loginSansVerification?'success':'primary'
    const suivantDisabled = nom?false:true

    return (
        <div>
            <Form.Group controlId="formNomUsager">
                <Form.Label><Trans>Authentification.nomUsager</Trans></Form.Label>
                <Form.Control
                    type="text"
                    placeholder={t('Authentification.saisirNom')}
                    value={nom}
                    onChange={nomUsagerOnChangeCb}
                    disabled={attente} />
        
                <Form.Text className="text-muted">
                    <Trans>Authentification.instructions1</Trans>
                </Form.Text>
            </Form.Group>

            <Row className="boutons preauth">
                <Col xs={12} sm={4} className="bouton-gauche">
                    <Button variant={variantBouton} disabled={attente || suivantDisabled} onClick={suivantCb}>
                        <Trans>Forms.next</Trans>
                    </Button>
                </Col>
                <Col xs={12} sm={4} >
                    <Button variant="secondary" disabled={true}>
                        <Trans>Forms.new</Trans>
                    </Button>
                </Col>
                <Col xs={12} sm={4}  className="bouton-droite">
                    <Button variant="secondary" onClick={annulerHandler}>
                        <Trans>Forms.cancel</Trans>
                    </Button>
                </Col>
            </Row>
        </div>
    )
}

function InputAfficherListeUsagers(props) {

    const {
//         // workers, etatConnexion, disabled, 
        nomUsager, setNomUsager,
        listeUsagers, 
        setNouvelUsager, 
        attente, setAttente,
        setAuthentifier, 
//         usagerDbLocal, setUsagerDbLocal,
//         etatUsagerBackend, setEtatUsagerBackend,
        setCompteRecovery,
        peutActiver,
        dureeSession, setDureeSession,
        erreurCb,
    } = props

    const usagerDb = useUsagerDb()[0]
    const usagerWebAuth = useUsagerWebAuth()[0]
    const [etatSessionActive, setEtatSessionActive] = useEtatSessionActive()

    const {t} = useTranslation()
    const workers = useWorkers()
//     const setEtatSessionActive = useSetEtatSessionActive()
//     // const etatConnexion = useEtatConnexion()
//     // const { connexion } = workers

    const nouvelUsagerHandler = useCallback( () => {
        setNouvelUsager(true)
        // Promise.all([
        //     setNomUsager(''),
        //     setEtatUsagerBackend(''),
        //     setUsagerDbLocal(''),
        // ]).then(()=>setNouvelUsager(true))
    }, [setNomUsager, setNouvelUsager])

    const usagerOnChange = useCallback(event=>{
        setNouvelUsager(false)
        setNomUsager(event.currentTarget.value)
    }, [setNomUsager, setNouvelUsager])

    const onChangeDureeSession = useCallback(event=>setDureeSession(event.currentTarget.value), [setDureeSession])

    const onSuccessWebAuth = useCallback(resultat=>{
        console.debug("InputAfficherListeUsagers onSuccessWebAuth ", resultat)

        const params = {...resultat, nomUsager}
        sauvegarderUsagerMaj(workers, params)
            .then(async () => {
                if(!!resultat.auth) {
                    console.info("InputAfficherListeUsagers onSuccessWebAuth Reconnecter %s pour authentification socket.io", nomUsager)
                    // Reconnexion devrait faire setEtatSessionActive(true) via socket.io
                    window.localStorage.setItem('usager', nomUsager)

                    await workers.connexion.reconnecter()
                    await workers.connexion.onConnect()
                } else {
                    console.error("onSuccessWebAuth Echec Authentification ", resultat)
                }
            })
            .catch(erreurCb)
            .finally(()=>setAttente(false))
    }, [workers, nomUsager, setAuthentifier, setEtatSessionActive, setAttente])

    const erreurAuthCb = useCallback((err, message)=>{
        if(err && ![0, 11, 20].includes(err.code)) {
            erreurCb(err, message)
        } else {
            //console.debug("Erreur authentification annulee/mauvaise cle, on passe au mode recovery")
            setCompteRecovery(true)
            setAuthentifier(true)
        }
    }, [erreurCb, setCompteRecovery, setAuthentifier])

    const suivantNoAuthCb = useCallback(
        () => {
            console.debug("BoutonsAuthentifier Suivantcb %s", nomUsager)
            try {
                setAttente(true)
                setAuthentifier(true)
                // workers.connexion.onConnect()
                //     .catch(erreurCb)
            } catch(err) {
                erreurCb(err)
            } finally {
                setAttente(false)
            }
        }, 
        [workers, nomUsager, setAttente, setAuthentifier, erreurCb]
    )

    useEffect(()=>{
        // console.debug("Re-Set nom usager")
        if(listeUsagers.length > 0) {
            if(listeUsagers.includes(nomUsager)) {
                // Rien a faire
            } else {
                const usagerLocal = window.localStorage.getItem('usager')
                if(listeUsagers.includes(usagerLocal)) {
                    setNomUsager(usagerLocal)
                } else {
                    setNomUsager(listeUsagers[0])
                }
            }
        }
    }, [nomUsager, setNomUsager, listeUsagers])

//     useEffect(()=>{
//         // console.debug("Pre-charger usager (etat %O) %O", etatConnexion, nomUsager)
//         // if(etatConnexion && nomUsager) {
//         //     // console.debug("Pre-charger le compte usager %s", nomUsager)
//         //     preparerUsager(workers, nomUsager, erreurCb, {genererChallenge: true})
//         //         .then(async resultat => {
//         //             const usagerDbLocal = await usagerDao.getUsager(nomUsager)
//         //             setEtatUsagerBackend(resultat)
//         //             setUsagerDbLocal(usagerDbLocal)
//         //             // console.debug("Usager backend info %O, dbLocal %O", resultat, usagerDbLocal)
//         //             // setAuthentifier(true)
//         //         })
//         //         .catch(err=>erreurCb(err))
//         //         .finally(()=>setAttente(false))
//         // }

//         console.debug("Pre-charger usager %O", nomUsager)
//         if(nomUsager) {
//             // console.debug("Pre-charger le compte usager %s", nomUsager)
//             preparerUsager(workers, nomUsager, erreurCb, {genererChallenge: true})
//                 .then(async resultat => {
//                     console.debug("Resultat preparer usager %O", resultat)
//                     const usagerDbLocal = await usagerDao.getUsager(nomUsager)
//                     setEtatUsagerBackend(resultat)
//                     setUsagerDbLocal(usagerDbLocal)
//                     setEtatSessionActive(!!resultat.authentifie)
//                 })
//                 .catch(err=>erreurCb(err))
//                 .finally(()=>setAttente(false))
//         }
//     }, [/*connexion, etatConnexion,*/ workers, nomUsager, setEtatUsagerBackend, setUsagerDbLocal, setUsagerDbLocal, erreurCb])

//     console.debug("Liste usagers : ", listeUsagers)
    if(!listeUsagers) return ''

    return (
        <div>
            <Form.Group controlId="formNomUsager">
                <Form.Label><Trans>Authentification.nomUsager</Trans></Form.Label>
                <Form.Select
                    type="text"
                    value={nomUsager}
                    placeholder={t('Authentification.saisirNom')}
                    onChange={usagerOnChange}
                    disabled={attente}>
            
                    {props.listeUsagers.map(nomUsager=>(
                        <option key={nomUsager} value={nomUsager}>{nomUsager}</option>
                    ))}
        
                </Form.Select>
        
                <Form.Text className="text-muted">
                    <Trans>Authentification.instructions2</Trans>
                </Form.Text>
            </Form.Group>

            <p></p>

            <Form.Group controlId="formDureeSession">
                <Form.Label>Duree de la session</Form.Label>
                <Form.Select 
                    value={dureeSession}
                    onChange={onChangeDureeSession}
                    disabled={attente}>
                    <option value='3600'>1 heure</option>
                    <option value='86400'>1 jour</option>
                    <option value='604800'>1 semaine</option>
                    <option value='2678400'>1 mois</option>
                </Form.Select>
                <Form.Text className="text-muted">
                    Apres cette periode, l'appareil va reverifier votre identite.
                </Form.Text>
            </Form.Group>

            <Row className="boutons preauth">

                <Col xs={12} sm={4} className="bouton-gauche">
                    <BoutonAuthentifierListe
                        setAttente={setAttente}
                        onClickWebAuth={onSuccessWebAuth}
                        suivantNoWebauthnHandler={suivantNoAuthCb}
                        erreurAuthCb={erreurAuthCb}
                        peutActiver={peutActiver}
                        dureeSession={dureeSession}
                    >
                        <Trans>Forms.next</Trans>
                        {peutActiver?[' ', <i className='fa fa-arrow-right'/>]:''}
                    </BoutonAuthentifierListe>
                </Col>

                <Col xs={12} sm={4} >
                    <Button variant="secondary" onClick={nouvelUsagerHandler}>
                        <Trans>Forms.new</Trans>
                    </Button>
                </Col>

                <Col xs={12} sm={4}  className="bouton-droite">
                    <Button variant="secondary" disabled={true}>
                        <Trans>Forms.cancel</Trans>
                    </Button>
                </Col>

            </Row>            
        </div>
    )

}

function BoutonAuthentifierListe(props) {

    // console.debug('BoutonAuthentifierListe PROPPIES', props)

    const { onClickWebAuth, suivantNoWebauthnHandler, erreurAuthCb, peutActiver, dureeSession } = props

    const usagerWebAuth = useUsagerWebAuth()[0]
    const usagerDb = useUsagerDb()[0]

    const nouvelUsager = useMemo(()=>{
        console.debug("BoutonAuthentifierListe usagerWebAuth : %O", usagerWebAuth)
        if(usagerWebAuth && !usagerWebAuth.infoUsager) return true
        return false
    }, [usagerWebAuth])

    const challengeWebauthn = useMemo(()=>{
        if(usagerWebAuth && usagerWebAuth.infoUsager) {
            return usagerWebAuth.infoUsager.authentication_challenge
        }
        return ''
    }, [usagerWebAuth])

    if(nouvelUsager || peutActiver === true) {
        return (
            <Button variant="success" onClick={suivantNoWebauthnHandler}>{props.children}</Button>
        )
    }

    return (
        <BoutonAuthentifierWebauthn
            variant="primary"
            challenge={challengeWebauthn}
            onSuccess={onClickWebAuth}
            onError={erreurAuthCb}
            usagerDb={usagerDb}
            dureeSession={dureeSession}
        >
            {props.children}
        </BoutonAuthentifierWebauthn>        
    )
}

async function ajouterCsrRecovery(workers, usagerDb) {
    const { connexion } = workers
    const { nomUsager, requete } = usagerDb
    if(nomUsager && requete && requete.csr) {
        const csr = requete.csr
        await connexion.ajouterCsrRecovery(nomUsager, csr)
    }
}

async function suivantInscrire(workers, nomUsager, setUsagerDb, erreurCb) {
    // console.debug("suivantInscrire Inscrire ", nomUsager)
    try {
        const {connexion} = workers
        const usagerInit = await initialiserCompteUsager(nomUsager)
        const requete = usagerInit.requete || {}
        const { csr, clePriveePem, fingerprintPk } = requete
 
        console.debug("suivantInscrire Inscrire usager %s avec CSR navigateur\n%O", nomUsager, csr)
        const reponseInscription = await connexion.inscrireUsager(nomUsager, csr)
        console.debug("suivantInscrire Reponse inscription : %O", reponseInscription)
      
        if(reponseInscription.ok !== true) {
            console.warn("Erreur inscription usager : ", reponseInscription)
            throw new Error(`Erreur inscription usager : ${reponseInscription}`)
        }

        // Enregistrer le certificat dans IndexedDB
        const certificatChaine = reponseInscription.certificat

        if(!certificatChaine) {
            erreurCb("Le certificat n'a pas ete recu lors de la confirmation d'inscription.", "L'inscription a echouee")
            return
        }

        // Injecter delegations_version: 1 au besoin
        const delegations_version = reponseInscription.delegations_version || 1
        reponseInscription.delegations_version = delegations_version

        console.debug("suivantInscrire Certificats recus : cert: %O", certificatChaine)
        await sauvegarderCertificatPem(nomUsager, certificatChaine, {clePriveePem, fingerprintPk, delegations_version})
      
        // Recharger usager, applique le nouveau certificat
        const usagerDbLocal = await usagerDao.getUsager(nomUsager)
        await setUsagerDb(usagerDbLocal)

        // Conserver usager selectionne pour reload
        window.localStorage.setItem('usager', nomUsager)

        // if(reponseInscription.authentifie === true) {
        //     // Declencher une authentification avec le nouveau certificat 
        //     console.debug("suivantInscrire Authentifier")
        //     //await connexion.authentifier()
        // }

    } catch(err) {
        console.error("suivantInscrire Erreur inscrire usager : %O", err)
        erreurCb(err, "Erreur inscrire usager")
    }
}

// async function fermerSession(setAuthentifier, setEtatUsagerBackend) {
//     const axios = (await import('axios')).default
//     try {
//         await axios.get('/millegrilles/authentification/fermer')
//     } catch(err) {
//         console.warn("Erreur fermer session : %O", err)
//     } finally {
//         setAuthentifier(false)
//         setEtatUsagerBackend(false)
//     }

//     try {
//         await axios.get('/auth/verifier_usager')
//     } catch(err) {
//         const response = err.response || {}
//         const status = response.status
//         if(status === 401) {
//             // Ok, session creee et usager n'est pas authentifie
//         } else {
//             console.error("Erreur verification session fermee : %O", response)
//         }
//     }
// }

async function sauvegarderUsagerMaj(workers, reponse) {

    if(!reponse.certificat) {
        await workers.connexion.onConnect()
        return
    }

    const { connexion, usagerDao } = workers
    const { nomUsager, delegations_date, delegations_version, certificat } = reponse

    // console.debug("Nouveau certificat recu, on va le sauvegarder")
    const usagerDbLocal = await usagerDao.getUsager(nomUsager)
    console.debug("UsagerDbLocal ", usagerDbLocal)

    console.debug("sauvegarderUsagerMaj Reponse %O, usagerDbLocal %O", reponse, usagerDbLocal)

    // Remplacer clePriveePem et fingerprintPk
    if(usagerDbLocal.requete) {
        const { clePriveePem, fingerprintPk } = usagerDbLocal.requete

        await sauvegarderCertificatPem(
            nomUsager, 
            certificat, 
            {clePriveePem, fingerprintPk, delegations_date, delegations_version}
        )

        // Reload usager
        return await usagerDao.getUsager(nomUsager)
    }
}

async function chargerFormatteurCertificat(workers, usagerDb) {
    console.debug("Preparer formatteur de messages pour usager %O", usagerDb)
    const connexion = workers.connexion
    const { certificat, clePriveePem } = usagerDb
    if(connexion && certificat && clePriveePem) {
        await connexion.initialiserFormatteurMessage(certificat, clePriveePem)
        return true
    } else {
        await connexion.clearFormatteurMessage()
        return false
    }
}

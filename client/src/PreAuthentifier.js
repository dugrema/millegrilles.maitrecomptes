import {useEffect, useState, useCallback, useMemo, useRef} from 'react'
import {proxy as comlinkProxy} from 'comlink'

import Row from 'react-bootstrap/Row'
import Col from 'react-bootstrap/Col'
import Button from 'react-bootstrap/Button'
import Form from 'react-bootstrap/Form'
import Alert from 'react-bootstrap/Alert'
import Overlay from 'react-bootstrap/Overlay'

import { Trans, useTranslation } from 'react-i18next'

import { BoutonActif, usagerDao } from '@dugrema/millegrilles.reactjs'

import useWorkers, {
    useEtatConnexion, useFormatteurPret, useEtatPret, 
    useEtatSessionActive, useSetEtatSessionActive, 
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

    const workers = useWorkers(),
          etatConnexion = useEtatConnexion()

    // Information du compte usager sur le serveur, challenges (webauthn/certificat)
    const [compteUsagerServeur, setCompteUsagerServeur] = useState('')

    // Information usager temporaire pour auth
    const [usagerDbLocal, setUsagerDbLocal] = useState('')          // Info db locale pre-auth pour nomUsager

    const [listeUsagers, setListeUsagers] = useState('')
    const [nomUsager, setNomUsager] = useState(window.localStorage.getItem('usager')||'')
    const [dureeSession, setDureeSession] = useState(window.localStorage.getItem('dureeSession')||'86400')

    // Flags
    const [nouvelUsager, setNouvelUsager] = useState(false)  // Flag pour bouton nouvel usager
    const [authentifier, setAuthentifier] = useState(false)  // Flag pour ecran inscrire/authentifier
    const [attente, setAttente] = useState(false)
    const [compteRecovery, setCompteRecovery] = useState(false)  // Mode pour utiliser un code pour associer compte

    const evenementFingerprintPkCb = useCallback(evenement=>{
        const { connexion } = workers
        
        console.debug("Recu message evenementFingerprintPkCb : %O", evenement)
        const { message } = evenement || {},
              { certificat } = message
        const { nomUsager, requete } = usagerDbLocal
        if(certificat && requete) {
            const { clePriveePem, fingerprintPk } = requete
            sauvegarderCertificatPem(nomUsager, certificat, {clePriveePem, fingerprintPk})
                .then(async ()=>{
                    const usagerMaj = await usagerDao.getUsager(nomUsager)
                    const nouvelleInfoBackend = await chargerUsager(connexion, nomUsager, null, fingerprintPk)

                    // Revenir a l'ecran d'authentification
                    setCompteRecovery(false)

                    // Pour eviter cycle, on fait sortir de l'ecran en premier. Set Usager ensuite.
                    setCompteUsagerServeur(nouvelleInfoBackend)
                    setUsagerDbLocal(usagerMaj)

                    setAuthentifier(true)
                    return workers.connexion.onConnect()
                })
                .catch(err=>erreurCb(err, "Erreur de sauvegarde du nouveau certificat, veuillez cliquer sur Retour et essayer a nouveau."))
        } else {
            console.warn("Recu message evenementFingerprintPkCb sans certificat %O ou requete locale vide %O", evenement, requete)
            erreurCb("Erreur de sauvegarde du nouveau certificat, veuillez cliquer sur Retour et essayer a nouveau.")
        }
    }, [
        workers, usagerDbLocal, 
        setAuthentifier, setCompteRecovery, setCompteUsagerServeur, setUsagerDbLocal,
        erreurCb,
    ])

    const requete = usagerDbLocal.requete || {},
          fingerprintPk = requete.fingerprintPk

    useEffect(()=>{
        usagerDao.getListeUsagers()
            .then(usagers=>{
                if(usagers.length === 0) setNouvelUsager(true)
                usagers.sort()  // Trier liste par nom
                setListeUsagers(usagers)
            })
            .catch(err=>erreurCb(err))
    }, [setListeUsagers, setNouvelUsager, erreurCb])

    // Load/re-load usagerDbLocal sur changement de nomUsager
    useEffect(()=>{
        if(!nomUsager) return
        if(!usagerDbLocal || usagerDbLocal.nomUsager !== nomUsager) {
            initialiserCompteUsager(nomUsager) 
                .then(usagerLocal=>{
                    setUsagerDbLocal(usagerLocal)
                    console.debug("SetUsagerDbLocal : %O", usagerLocal)
                })
                .catch(erreurCb)
        }
    }, [nomUsager, usagerDbLocal, setUsagerDbLocal, erreurCb])

    useEffect(()=>{
        // if(!etatConnexion) return
        // const { connexion } = workers
        // if(fingerprintPk) {
        //     // Activer listener
        //     const cb = comlinkProxy(evenementFingerprintPkCb)
        //     console.debug("Ajouter listening fingerprints : %s", fingerprintPk)
        //     connexion.enregistrerCallbackEvenementsActivationFingerprint(fingerprintPk, cb)
        //         .then(()=>{
        //             workers.connexion.getInfoUsager(nomUsager, fingerprintPk).then(reponse=>{
        //                 console.debug("Information usager : ", reponse)
        //                 if(reponse.certificat) {
        //                     evenementFingerprintPkCb({message: reponse})
        //                         .catch(err=>console.error("Erreur recuperation certificat usager : ", err))
        //                 }
        //             })
        //             .catch(err=>console.info("Erreur chargement information certificat usager : ", err))
        //         })
        //         .catch(err=>erreurCb(err))
        //     return () => {
        //         console.debug("Retrait listening fingerprints : %s", fingerprintPk)
        //         connexion.retirerCallbackEvenementsActivationFingerprint(fingerprintPk, cb)
        //             .catch(err=>console.warn("Erreur retrait evenement fingerprints : %O", err))
        //     }
        // }
    }, [workers, etatConnexion, nomUsager, fingerprintPk, evenementFingerprintPkCb, erreurCb])

    if(compteRecovery) {
        // Etape = CompteRecovery
        return (
            <CompteRecovery 
                usagerDbLocal={usagerDbLocal}
                setUsagerDbLocal={setUsagerDbLocal}
                compteUsagerServeur={compteUsagerServeur}
                setCompteUsagerServeur={setCompteUsagerServeur}
                setAuthentifier={setAuthentifier}
                setCompteRecovery={setCompteRecovery}
                erreurCb={erreurCb}
                />
        )
    } else if(authentifier) {
        if(compteUsagerServeur && compteUsagerServeur.infoUsager) {
            if(compteUsagerServeur.infoUsager.compteUsager === false) {
                // Etape = InscrireUsager
                return (
                    <InscrireUsager 
                        setAuthentifier={setAuthentifier}
                        nomUsager={nomUsager}
                        setUsagerDbLocal={setUsagerDbLocal}
                        erreurCb={erreurCb}
                        />
                )
            } else {
                // Etape = Authentifier
                return (
                    <Authentifier 
                        nouvelUsager={nouvelUsager}
                        setAttente={setAttente}
                        nomUsager={nomUsager}
                        dureeSession={dureeSession}
                        usagerDbLocal={usagerDbLocal}
                        setAuthentifier={setAuthentifier}
                        etatUsagerBackend={compteUsagerServeur}
                        setEtatUsagerBackend={setCompteUsagerServeur}
                        setCompteRecovery={setCompteRecovery}
                        erreurCb={erreurCb}
                        />
                )
            }
        }
    } else {
        // Etape = FormSelectionnerUsager
        return (
            <FormSelectionnerUsager 
                nomUsager={nomUsager}
                setNomUsager={setNomUsager}
                nouvelUsager={nouvelUsager}
                setNouvelUsager={setNouvelUsager}
                attente={attente}
                setAttente={setAttente}
                setAuthentifier={setAuthentifier}
                listeUsagers={listeUsagers}
                setCompteRecovery={setCompteRecovery}
                etatUsagerBackend={compteUsagerServeur}
                setEtatUsagerBackend={setCompteUsagerServeur}
                usagerDbLocal={usagerDbLocal}
                setUsagerDbLocal={setUsagerDbLocal}
                dureeSession={dureeSession}
                setDureeSession={setDureeSession}
                erreurCb={erreurCb}
                />
        )
    }

}

function CompteRecovery(props) {

    useEffect(()=>console.debug("CompteRecovery proppies ", props), [props])

    const { 
        usagerDbLocal, setUsagerDbLocal, 
        compteUsagerServeur, setCompteUsagerServeur, 
        setAuthentifier, setCompteRecovery,
        erreurCb,
    } = props

    const { t } = useTranslation()
    const workers = useWorkers(),
          etatConnexion = useEtatConnexion()

    // const usagerDbLocal = useMemo(()=>{return props.usagerDbLocal || {}}, [props.usagerDbLocal])

    const requete = usagerDbLocal.requete || {},
          nomUsager = usagerDbLocal.nomUsager,
          csr = requete.csr,
          fingerprintPk = requete.fingerprintPk

    const refBoutonCodeActivation = useRef()
    const refBoutonCsrCopie = useRef()

    const [code, setCode] = useState('')
    const [showCodeCopie, setShowCodeCopie] = useState(false)
    const [showCsrCopie, setShowCsrCopie] = useState(false)

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

    const webAuthnSuccessHandler = useCallback(resultat=>{
        setCompteRecovery(false)
        sauvegarderUsagerMaj(workers, resultat)
            .catch(erreurCb)
    }, [workers, setCompteRecovery])

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

    useEffect(()=>{
        const { requete } = usagerDbLocal
        if(nomUsager) {
            // S'assurer qu'on une requete ou le bon compte
            if(!requete) {
                console.debug("Generer nouveau CSR")
                initialiserCompteUsager(nomUsager, {regenerer: true})
                    .then(usager=>{
                        setUsagerDbLocal(usager)
                        return ajouterCsrRecovery(workers, usager)
                    })
                    .catch(err=>erreurCb(err))
            } else {
                ajouterCsrRecovery(workers, usagerDbLocal)
                    .catch(err=>erreurCb(err))
            }
        }
    }, [workers, nomUsager, usagerDbLocal, setUsagerDbLocal, erreurCb])

    useEffect(()=>{
        if(fingerprintPk) {
            let codeComplet = fingerprintPk.slice(fingerprintPk.length-8)
            codeComplet = codeComplet.toLowerCase()
            codeComplet = [codeComplet.slice(0,4), codeComplet.slice(4,8)].join('-')
            setCode(codeComplet)
        } else {
            setCode('')
        }
    }, [fingerprintPk, setCode])

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

                    <BoutonAuthentifierWebauthn
                        variant="secondary"
                        challenge={compteUsagerServeur.infoUsager.challengeWebauthn}
                        onSuccess={webAuthnSuccessHandler}
                        onError={erreurAuthCb}
                        usagerDbLocal={usagerDbLocal}
                    >
                        {t('Authentification.echec-cle-bouton')}
                    </BoutonAuthentifierWebauthn>

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

    const { t } = useTranslation()
    const workers = useWorkers()
    
    const { setAuthentifier, nomUsager, setUsagerDbLocal, erreurCb } = props

    const [etatBouton, setEtatBouton] = useState('')

    const onClickSuivant = useCallback( () => {
        setEtatBouton('attente')
        suivantInscrire(workers, nomUsager, setUsagerDbLocal, erreurCb)
            .then(()=>{
                setEtatBouton('succes')
                setAuthentifier(true)
                return workers.connexion.onConnect()
            })
            .catch(err=>{
                setEtatBouton('echec')
                erreurCb(err)
            })
    }, [workers, nomUsager, setUsagerDbLocal, setEtatBouton, erreurCb])
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
        usagerDbLocal, 
        setAuthentifier, etatUsagerBackend, setEtatUsagerBackend, 
        setCompteRecovery,
        erreurCb
    } = props

    const workers = useWorkers(),
          etatFormatteurPret = useFormatteurPret(),
          etatPret = useEtatPret()

    const challengeWebauthn = useMemo(()=>{
        if(etatUsagerBackend && etatUsagerBackend.infoUsager) {
            return etatUsagerBackend.infoUsager.authentication_challenge
        }
    }, [etatUsagerBackend])

    const onClickWebAuth = useCallback(resultat=>{
        console.debug("Authentifier onclick webauthn %s : %O", nomUsager, resultat)
        sauvegarderUsagerMaj(workers, resultat)
            .catch(erreurCb)
    }, [workers, nomUsager, erreurCb])

    // Attendre que le formatteur (certificat) soit pret
    useEffect(()=>{
        console.debug("Formatteur pret? %s, usagerDbLocal %O, etat usager back-end : %O", 
            etatFormatteurPret, usagerDbLocal, etatUsagerBackend)
        
        if(!usagerDbLocal) return

        const { connexion } = workers

        if(!etatFormatteurPret) {
            chargerFormatteurCertificat(workers, usagerDbLocal).catch(erreurCb)
        } else if(etatUsagerBackend) {
            console.debug("onClickWebAuth etatUsagerBackend : ", etatUsagerBackend)
            // Authentifier
            const methodesDisponibles = etatUsagerBackend.infoUsager.methodesDisponibles || {}
            if(methodesDisponibles['certificat']) {
                // console.debug("Authentifier avec le certificat")
                // connexion.authentifierCertificat(challengeCertificat)
                connexion.authentifier()
                    .then(reponse=>{
                        //console.debug("Reponse authentifier certificat : %O", reponse)
                        setEtatUsagerBackend(reponse)
                    })
                    .catch(err=>{
                        console.warn("Authentifier: Erreur de connexion : %O", err)
                        // Note : erreur OK, le compte peut avoir un certificat active dans navigateur tiers
                        // erreurCb(err, 'Erreur de connexion (authentification du certificat refusee)')
                    })
            }
        } else if(!nouvelUsager && etatPret === false && !usagerDbLocal.certificat) {
            // On a un certificat absent ou expire
            // console.info("Certificat absent")
            setCompteRecovery(true)
        }
    }, [
        workers, etatFormatteurPret, etatPret, nouvelUsager, usagerDbLocal, etatUsagerBackend, 
        setEtatUsagerBackend, setCompteRecovery, 
        erreurCb
    ])

    // Conserver usager selectionne (pour reload ecran)
    useEffect(()=>window.localStorage.setItem('usager', nomUsager), [nomUsager])
    useEffect(()=>{
        console.debug("Set duree session ", dureeSession)
        window.localStorage.setItem('dureeSession', dureeSession)
    }, [dureeSession])

    const recoveryCb = useCallback(()=>setCompteRecovery(true), [setCompteRecovery])

    const annulerCb = useCallback(()=>{
        fermerSession(setAuthentifier, setEtatUsagerBackend)
            .catch(err=>erreurCb(err))
    }, [setAuthentifier, setEtatUsagerBackend, erreurCb])

    let message = <p>Ouverture d'une nouvelle session en cours ... <i className="fa fa-spinner fa-spin fa-fw" /></p>
    if(nouvelUsager) message = 'Cliquez sur Suivant pour vous connecter.'
    else if(!etatPret) message = 'Attente de preparation du certificat'

    return (
        <>
            <Alert variant="info">
                <Alert.Heading>Ouverture de session</Alert.Heading>
                
                {message}
            </Alert>

            <Row>
                <Col className="button-list">
                    {(usagerDbLocal && nouvelUsager)?
                        <BoutonAuthentifierWebauthn 
                            challenge={challengeWebauthn}
                            setAttente={setAttente}
                            onSuccess={onClickWebAuth}
                            onError={erreurCb}
                            usagerDbLocal={usagerDbLocal}
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
        listeUsagers,
        setCompteRecovery,
        etatUsagerBackend, setEtatUsagerBackend, 
        usagerDbLocal, setUsagerDbLocal,
        dureeSession, setDureeSession,
        erreurCb,
    } = props

    console.debug("Etat usager backend : ", etatUsagerBackend)

    const etatUsagerInfo = etatUsagerBackend.infoUsager || {},
        activation = etatUsagerInfo.activation || {},
        peutActiver = activation.valide === true

    if(nouvelUsager) {
        return (
            <Form.Group controlId="formNomUsager">
                <InputSaisirNomUsager 
                    nomUsager={nomUsager}
                    setNomUsager={setNomUsager}
                    setNouvelUsager={setNouvelUsager} 
                    attente={attente}
                    setAttente={setAttente}
                    setEtatUsagerBackend={setEtatUsagerBackend}
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
                usagerDbLocal={usagerDbLocal} 
                setUsagerDbLocal={setUsagerDbLocal}
                etatUsagerBackend={etatUsagerBackend} 
                setEtatUsagerBackend={setEtatUsagerBackend}
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
        setNomUsager: setNom, 
        attente, setAttente, 
        setNouvelUsager, 
        setAuthentifier, 
        // etatUsagerBackend, 
        setEtatUsagerBackend,
        setCompteRecovery,
        setUsagerDbLocal,
        peutActiver,
        erreurCb
    } = props

    const {t} = useTranslation()
    const workers = useWorkers()

    const [nomUsager, setNomUsager] = useState('')
   
    const changerNomUsager = useCallback(event=>setNomUsager(event.currentTarget.value), [setNomUsager])

    const annulerHandler = useCallback(()=>setNouvelUsager(false), [setNouvelUsager])

    const suivantCb = useCallback(
        () => {
            const { connexion } = workers

            console.debug("BoutonsAuthentifier Suivantcb %s", nomUsager)
            setAttente(true)
            preparerUsager(workers, nomUsager, erreurCb, {genererChallenge: true})
                .then(async resultat => {
                    console.debug("Resultat preparer usager %s : ", nomUsager, resultat)
                    // const usagerDbLocal = await usagerDao.getUsager(nomUsager)
                    setNom(nomUsager)
                    setEtatUsagerBackend(resultat)
                    // setUsagerDbLocal(usagerDbLocal)
                    setAuthentifier(true)
                    // await connexion.onConnect()
                    // sauvegarderUsagerMaj(workers, resultat)
                    //     .catch(err=>console.error("InputAfficherListeUsagers onClickWebAuth ", err))
                })
                .catch(err=>erreurCb(err))
                .finally(()=>setAttente(false))
        }, 
        [workers, nomUsager, setNom, setAttente, setAuthentifier, setEtatUsagerBackend, erreurCb]
    )

    if(!!props.show) return ''

    let loginSansVerification = peutActiver
    let variantBouton = loginSansVerification?'success':'primary'
    const suivantDisabled = nomUsager?false:true

    return (
        <div>
            <Form.Group controlId="formNomUsager">
                <Form.Label><Trans>Authentification.nomUsager</Trans></Form.Label>
                <Form.Control
                    type="text"
                    placeholder={t('Authentification.saisirNom')}
                    value={nomUsager}
                    onChange={changerNomUsager}
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
        // workers, etatConnexion, disabled, 
        nomUsager, setNomUsager,
        listeUsagers, 
        setNouvelUsager, 
        attente, setAttente,
        setAuthentifier, 
        usagerDbLocal, setUsagerDbLocal,
        etatUsagerBackend, setEtatUsagerBackend,
        setCompteRecovery,
        peutActiver,
        dureeSession, setDureeSession,
        erreurCb,
    } = props

    const {t} = useTranslation()
    const workers = useWorkers()
    const setEtatSessionActive = useSetEtatSessionActive()
    // const etatConnexion = useEtatConnexion()
    // const { connexion } = workers

    const nouvelUsagerHandler = useCallback( () => {
        Promise.all([
            setNomUsager(''),
            setEtatUsagerBackend(''),
            setUsagerDbLocal(''),
        ]).then(()=>setNouvelUsager(true))
    }, [setNomUsager, setNouvelUsager, setEtatUsagerBackend])

    const onChangeUsager = useCallback(event=>{
        setEtatUsagerBackend('')
        setUsagerDbLocal('')
        setNouvelUsager(false)
        setNomUsager(event.currentTarget.value)
    }, [setNomUsager, setEtatUsagerBackend, setUsagerDbLocal, setNouvelUsager])

    const onChangeDureeSession = useCallback(event=>{
        const value = event.currentTarget.value
        console.debug("onChangeDureeSession ", value)
        setDureeSession(value)
    }, [setDureeSession])

    const onClickWebAuth = useCallback(resultat=>{
        console.debug("InputAfficherListeUsagers onClickWebAuth ", resultat)
        setAuthentifier(true)
        // sauvegarderUsagerMaj(workers, resultat)
        //     .catch(err=>console.error("InputAfficherListeUsagers onClickWebAuth ", err))
        setEtatSessionActive(!!resultat.auth)
    }, [workers, setAuthentifier, setEtatSessionActive])

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
                workers.connexion.onConnect()
                    .catch(erreurCb)
            } catch(err) {
                erreurCb(err)
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
                    // console.debug("Set nom usager 1 - ", usagerLocal)
                    setNomUsager(usagerLocal)
                } else {
                    // console.debug("Set nom usager 2 - ", listeUsagers[0])
                    setNomUsager(listeUsagers[0])
                }
            }
        }
    }, [nomUsager, setNomUsager, listeUsagers])

    useEffect(()=>{
        // console.debug("Pre-charger usager (etat %O) %O", etatConnexion, nomUsager)
        // if(etatConnexion && nomUsager) {
        //     // console.debug("Pre-charger le compte usager %s", nomUsager)
        //     preparerUsager(workers, nomUsager, erreurCb, {genererChallenge: true})
        //         .then(async resultat => {
        //             const usagerDbLocal = await usagerDao.getUsager(nomUsager)
        //             setEtatUsagerBackend(resultat)
        //             setUsagerDbLocal(usagerDbLocal)
        //             // console.debug("Usager backend info %O, dbLocal %O", resultat, usagerDbLocal)
        //             // setAuthentifier(true)
        //         })
        //         .catch(err=>erreurCb(err))
        //         .finally(()=>setAttente(false))
        // }

        console.debug("Pre-charger usager %O", nomUsager)
        if(nomUsager) {
            // console.debug("Pre-charger le compte usager %s", nomUsager)
            preparerUsager(workers, nomUsager, erreurCb, {genererChallenge: true})
                .then(async resultat => {
                    const usagerDbLocal = await usagerDao.getUsager(nomUsager)
                    setEtatUsagerBackend(resultat)
                    setUsagerDbLocal(usagerDbLocal)
                })
                .catch(err=>erreurCb(err))
                .finally(()=>setAttente(false))
        }
    }, [/*connexion, etatConnexion,*/ workers, nomUsager, setEtatUsagerBackend, setUsagerDbLocal, erreurCb])

    console.debug("Liste usagers : ", listeUsagers)
    if(!listeUsagers) return ''

    return (
        <div>
            <Form.Group controlId="formNomUsager">
                <Form.Label><Trans>Authentification.nomUsager</Trans></Form.Label>
                <Form.Select
                    type="text"
                    value={nomUsager}
                    placeholder={t('Authentification.saisirNom')}
                    onChange={onChangeUsager}
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
                        etatUsagerBackend={etatUsagerBackend}
                        setAttente={setAttente}
                        onClickWebAuth={onClickWebAuth}
                        suivantNoWebauthnHandler={suivantNoAuthCb}
                        erreurAuthCb={erreurAuthCb}
                        usagerDbLocal={usagerDbLocal}
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

    const {
        etatUsagerBackend, onClickWebAuth, suivantNoWebauthnHandler, 
        erreurAuthCb, usagerDbLocal, peutActiver, dureeSession,
    } = props

    const workers = useWorkers()

    const challengeWebauthn = useMemo(()=>{
        if(etatUsagerBackend && etatUsagerBackend.infoUsager) {
            return etatUsagerBackend.infoUsager.authentication_challenge
        }
        return ''
    }, [etatUsagerBackend])

    if(peutActiver === true) {
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
            usagerDbLocal={usagerDbLocal}
            dureeSession={dureeSession}
        >
            {props.children}
        </BoutonAuthentifierWebauthn>        
    )
}

async function ajouterCsrRecovery(workers, usagerDbLocal) {
    const { connexion } = workers
    const { nomUsager, requete } = usagerDbLocal
    if(nomUsager && requete && requete.csr) {
        const csr = requete.csr
        //console.debug("ajouterCsrRecovery csr: %O", csr)
        await connexion.ajouterCsrRecovery(nomUsager, csr)
        //console.debug("ajouterCsrRecovery Reponse %O", reponse)
    }
}

async function suivantInscrire(workers, nomUsager, setUsagerDbLocal, erreurCb) {
    //console.debug("Inscrire")
    try {
        const {connexion} = workers
        const usagerInit = await initialiserCompteUsager(nomUsager)
        const requete = usagerInit.requete || {}
        const { csr, clePriveePem, fingerprintPk } = requete
 
        // console.debug("suivantInscrire Inscrire usager %s avec CSR navigateur\n%O", nomUsager, csr)
        const reponseInscription = await connexion.inscrireUsager(nomUsager, csr)
        // console.debug("suivantInscrire Reponse inscription : %O", reponseInscription)
      
        // Enregistrer le certificat dans IndexedDB
        const certificatChaine = reponseInscription.certificat

        if(!certificatChaine) {
            erreurCb("Le certificat n'a pas ete recu lors de la confirmation d'inscription.", "L'inscription a echouee")
            return
        }

        // Injecter delegations_version: 1 au besoin
        const delegations_version = reponseInscription.delegations_version || 1
        reponseInscription.delegations_version = delegations_version

        // console.debug("suivantInscrire Certificats recus : cert: %O", certificatChaine)
        await sauvegarderCertificatPem(nomUsager, certificatChaine, {clePriveePem, fingerprintPk, delegations_version})
      
        // Recharger usager, applique le nouveau certificat
        const usagerDbLocal = await usagerDao.getUsager(nomUsager)
        await setUsagerDbLocal(usagerDbLocal)

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

async function fermerSession(setAuthentifier, setEtatUsagerBackend) {
    const axios = (await import('axios')).default
    try {
        await axios.get('/millegrilles/authentification/fermer')
    } catch(err) {
        console.warn("Erreur fermer session : %O", err)
    } finally {
        setAuthentifier(false)
        setEtatUsagerBackend(false)
    }

    try {
        await axios.get('/auth/verifier_usager')
    } catch(err) {
        const response = err.response || {}
        const status = response.status
        if(status === 401) {
            // Ok, session creee et usager n'est pas authentifie
        } else {
            console.error("Erreur verification session fermee : %O", response)
        }
    }
}

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

    // Remplacer clePriveePem et fingerprintPk
    const { clePriveePem, fingerprintPk } = usagerDbLocal.requete

    await sauvegarderCertificatPem(
        nomUsager, 
        certificat, 
        {clePriveePem, fingerprintPk, delegations_date, delegations_version}
    )

    // Reload usager (trigger reload formatteurMessages)
    // const usagerReloade = await usagerDao.getUsager(nomUsager)
    // console.debug("Set usagerDb local - forcer login ", usagerReloade)
    // setUsagerDbLocal(usagerReloade)

    const reponseConnect = await connexion.onConnect()
    console.debug("Reponse authentifier certificat : %O", reponseConnect)
}

async function chargerFormatteurCertificat(workers, usager) {
    console.debug("Preparer formatteur de messages pour usager %O", usager)
    const connexion = workers.connexion
    const { certificat, clePriveePem } = usager
    if(connexion && certificat && clePriveePem) {
        await connexion.initialiserFormatteurMessage(certificat, clePriveePem)
        return true
    } else {
        await connexion.clearFormatteurMessage()
        return false
    }
}

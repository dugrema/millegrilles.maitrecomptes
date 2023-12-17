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
import { BoutonActif, usagerDao, SelectDureeSession } from '@dugrema/millegrilles.reactjs'

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
            <Col xs={0} sm={1} md={1} lg={2}></Col>
            <Col xs={12} sm={10} md={10} lg={8}>
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
}

function CompteRecovery(props) {
    const { 
        setAuthentifier, setCompteRecovery,
        reloadCompteUsager,
        erreurCb,
    } = props

    const { t } = useTranslation()

    const workers = useWorkers()
    const [usagerDb, setUsagerDb] = useUsagerDb()

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

            <h4>{t('Authentification.echec-activation-titre')}</h4>
            <Row>
                <Col xs={12} md={5} lg={4}>
                    <Row>
                        <Col xs={4}>{t('Authentification.echec-activation-champ-code')}</Col>
                        <Col className='code-activation'>
                            <Button variant='link' ref={refBoutonCodeActivation} onClick={copierCodeHandler}>{code}</Button>
                        </Col>
                    </Row>
                    <Row>
                        <Col xs={4}>{t('Authentification.echec-activation-champ-compte')}</Col>
                        <Col>{nomUsager}</Col>
                    </Row>
                </Col>
                <Col>
                    <ul>
                        <li className='code-instructions'>{t('Authentification.echec-activation-instruction1')}</li>
                        <li className='code-instructions'>{t('Authentification.echec-activation-instruction2')}</li>
                    </ul>
                </Col>
            </Row>

            <h4>{t('Authentification.echec-cle-titre')}</h4>
            <Row>
                <Col xs={12} className='no-print'>
                    <p className='code-instructions'>{t('Authentification.echec-cle-instruction')}</p>
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

                    // S'assurer d'avoir le bon nomUsager
                    window.localStorage.setItem('usager', nomUsager)

                    // Reconnexion devrait faire setEtatSessionActive(true) via socket.io
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

        // Conserver le nomUsager meme en cas d'echec pour reessayer
        window.localStorage.setItem('usager', nomUsager)

        const infoUsager = usagerWebAuth.infoUsager || {}
        const methodesDisponibles = infoUsager.methodesDisponibles
        const challengeCertificat = infoUsager.challenge_certificat
        if(methodesDisponibles.activation && challengeCertificat) {
            console.debug("Authentification avec signature certificat et challenge ", challengeCertificat)

            const data = {certificate_challenge: challengeCertificat, activation: true, dureeSession}
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
    }, [workers, etatFormatteurPret, usagerWebAuth, setAuthentifier, nomUsager])

    const recoveryCb = useCallback(()=>setCompteRecovery(true), [setCompteRecovery])
    const annulerCb = useCallback(()=>setAuthentifier(false), [setAuthentifier])

    let message = <p>Ouverture d'une nouvelle session en cours ... <i className="fa fa-spinner fa-spin fa-fw" /></p>
    if(nouvelUsager) message = 'Cliquez sur Suivant pour vous connecter.'

    return (
        <>
            <Alert variant="info">
                <Alert.Heading>Ouverture de session</Alert.Heading>
                
                {message}
            </Alert>

            <Row className='buttonbar'>
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

    const peutActiver = useMemo(()=>{
        if(!usagerWebAuth || !usagerWebAuth.infoUsager) return false
        const methodesDisponibles = usagerWebAuth.infoUsager.methodesDisponibles || {}
        console.debug("FormSelectionnerUsager peutActiver methodesDisponibles : ", methodesDisponibles)
        return methodesDisponibles.activation || false
    }, [usagerWebAuth])

    const setCompteRecoveryCb = useCallback(value=>{
        // Conserver le nomUsager meme en cas d'echec pour reessayer
        window.localStorage.setItem('usager', nomUsager)
        setCompteRecovery(value)
    }, [setCompteRecovery, nomUsager])

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
                setCompteRecovery={setCompteRecoveryCb}
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
        dureeSession, setDureeSession,
        erreurCb
    } = props

    const {t} = useTranslation()
    const workers = useWorkers()

    const [nom, setNom] = useState('')
   
    const nomUsagerOnChangeCb = useCallback(event=>setNom(event.currentTarget.value), [setNom])
    const onChangeDureeSession = useCallback(event=>setDureeSession(event.currentTarget.value), [setDureeSession])
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

            <p></p>
            <SelectDureeSession value={dureeSession} onChange={onChangeDureeSession} />            

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
        nomUsager, setNomUsager,
        listeUsagers, 
        setNouvelUsager, 
        attente, setAttente,
        setAuthentifier, 
        setCompteRecovery,
        peutActiver,
        dureeSession, setDureeSession,
        erreurCb,
    } = props

    const [etatSessionActive, setEtatSessionActive] = useEtatSessionActive()

    const {t} = useTranslation()
    const workers = useWorkers()

    const nouvelUsagerHandler = useCallback( () => {
        setNouvelUsager(true)
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

            <SelectDureeSession value={dureeSession} onChange={onChangeDureeSession} />

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

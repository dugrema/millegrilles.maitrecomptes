import {useEffect, useState, useCallback, useMemo, useRef} from 'react'
import {proxy as comlinkProxy} from 'comlink'

import Row from 'react-bootstrap/Row'
import Col from 'react-bootstrap/Col'
import Button from 'react-bootstrap/Button'
import Alert from 'react-bootstrap/Alert'
import Overlay from 'react-bootstrap/Overlay'

import { Trans, useTranslation } from 'react-i18next'

import useWorkers, { useUsagerDb } from './WorkerContext'

import { RenderCsr } from './QrCodes'

import { initialiserCompteUsager } from './comptesUtil'


function CompteRecovery(props) {
    const { 
        annuler, setCompteRecovery,
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
                <Col xs={2} md={1} className="bouton"><Button onClick={annuler} variant="secondary"><i className='fa fa-remove'/></Button></Col>
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

export default CompteRecovery

async function ajouterCsrRecovery(workers, usagerDb) {
    const { connexion } = workers
    const { nomUsager, requete } = usagerDb
    if(nomUsager && requete && requete.csr) {
        const csr = requete.csr
        await connexion.ajouterCsrRecovery(nomUsager, csr)
    }
}

import axios from 'axios'
import {useEffect, useCallback, useMemo} from 'react'

import Row from 'react-bootstrap/Row'
import Col from 'react-bootstrap/Col'
import Button from 'react-bootstrap/Button'
import Alert from 'react-bootstrap/Alert'

import { MESSAGE_KINDS } from '@dugrema/millegrilles.utiljs/src/constantes'

import useWorkers, { useFormatteurPret, useUsagerDb, useUsagerWebAuth } from './WorkerContext'

import { BoutonAuthentifierWebauthn } from './WebAuthn'

import { sauvegarderUsagerMaj } from './comptesUtil'

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

export default Authentifier

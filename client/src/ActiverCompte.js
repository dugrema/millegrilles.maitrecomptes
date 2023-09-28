import { useState, useCallback, useEffect  } from 'react'
import Alert from 'react-bootstrap/Alert'
import Button from 'react-bootstrap/Button'
import Row from 'react-bootstrap/Row'
import Col from 'react-bootstrap/Col'
import Form from 'react-bootstrap/Form'

import base64url from 'base64url'

import { AfficherActivationsUsager, supporteCamera, BoutonActif } from '@dugrema/millegrilles.reactjs'

import useWorkers, {useUsagerDb, useUsagerSocketIo, useEtatPret} from './WorkerContext'

import ErrorBoundary from './ErrorBoundary';
import { preparerAuthentification, signerDemandeAuthentification } from './WebAuthn'

function SectionActiverCompte(props) {
    const {fermer, erreurCb} = props

    return (
        <>
            <Row>
                <Col xs={10} md={11}><h2>Activer un appareil</h2></Col>
                <Col xs={2} md={1} className="bouton">
                    <Button onClick={fermer} variant="secondary"><i className='fa fa-remove'/></Button>
                </Col>
            </Row>

            <p>
                Cette section permet d'activer votre compte sur un autre appareil ou site lie a cette MilleGrille.
            </p>

            <ActivationUsager 
                erreurCb={erreurCb} />

            <hr/>

            <Alert variant="dark" show={true}>
                <Alert.Heading>Instructions</Alert.Heading>
                <p>
                    Pour proceder, vous devez obtenir un code sur votre autre appareil ou site. 
                    Le code est genere lors d'un echec d'authentification.
                </p>

                <ol>
                    <li>Utiliser votre autre appareil, ou ce navigateur pour aller sur le site</li>
                    <li>Choisissez/entrez votre nom d'usager</li>
                    <li>Cliquez sur suivant</li>
                    <li>Cliquez sur Annuler ou attendez 1 minute.</li>
                    <li>La page avec l'information d'activation de compte est affichee.</li>
                    <li>Revenir sur cette page et entrer le code (e.g. jdzl-a7u7) ou scanner le code QR.</li>
                </ol>
            </Alert>

        </>
    )
}

export default SectionActiverCompte

function ActivationUsager(props) {

    const { erreurCb } = props

    const workers = useWorkers()
    const usagerDb = useUsagerDb()[0]
    const usagerSocketIo = useUsagerSocketIo()[0]
    const etatPret = useEtatPret()

    const { nomUsager } = usagerDb
  
    const [supportCodeQr, setSupportCodeQr] = useState(false)
    const [csr, setCsr] = useState('')
    const [challengeOriginal, setChallengeOriginal] = useState('')
    const [preparationWebauthn, setPreparationWebauthn] = useState('')
    const [resultatActivation, setResultatActivation] = useState('')

    const csrCb = useCallback(csr=>{
      console.debug("Recu csr : %O", csr)
      setCsr(csr)
    }, [setCsr])
  
    const activerCodeCb = useCallback(()=>{
        const {connexion} = workers
        const {demandeCertificat, publicKey} = preparationWebauthn
        const origin = window.location.hostname
        
        setResultatActivation('attente')
        
        signerDemandeAuthentification(nomUsager, demandeCertificat, publicKey)
            .then(async signatureWebauthn => {
                console.debug("Resultat signature webauthn : %O", signatureWebauthn)

                const commande = {
                    demandeCertificat: signatureWebauthn.demandeCertificat,
                    clientAssertionResponse: signatureWebauthn.webauthn,
                    origin,
                    hostname: origin,
                    challenge: challengeOriginal,
                }

                console.debug("Commande demande signature : %O", commande)
                const reponse = await connexion.signerRecoveryCsr(commande)
                console.debug("Reponse signature certificat : %O", reponse)

                if(reponse.err) {
                    setResultatActivation('echec')
                    erreurCb(reponse.err, "Erreur lors de l'activation du code")
                } else {
                    setResultatActivation('succes')
                }
            })
            .catch(err=>{
                setResultatActivation('echec')
                erreurCb(err)
            })
    }, [workers, nomUsager, challengeOriginal, preparationWebauthn, setResultatActivation, erreurCb])

    useEffect(()=>{
      supporteCamera()
        .then(support=>setSupportCodeQr(support))
        .catch(err=>erreurCb(err))
    }, [setSupportCodeQr, erreurCb])


    // Charger le nom de l'usager dans le CSR
    useEffect(()=>{
        if(csr) {
            console.debug("Generer challenge pour %O\nUsager socketio %O\nCSR %s", usagerDb, usagerSocketIo, csr)
            const hostname = window.location.hostname
            workers.connexion.genererChallenge({
                hostname,
                webauthnAuthentication: true
            }).then(reponseChallenge=>{
                console.debug("Challenge webauthn : ", reponseChallenge)
                const authenticationChallenge = reponseChallenge.authentication_challenge
                setChallengeOriginal(authenticationChallenge.publicKey.challenge)
                return preparerAuthentification(nomUsager, authenticationChallenge, csr, {activationTierce: true})
            })
            .then(challengePrepare=>{
                console.debug("Challenge webauthn prepare : ", challengePrepare)
                setPreparationWebauthn(challengePrepare)
            })
            .catch(erreurCb)
        }
    }, [nomUsager, usagerSocketIo, csr, setPreparationWebauthn, setChallengeOriginal, erreurCb])

    return (
      <>
        <h2>Activer compte</h2>

        <ErrorBoundary>
            <AfficherActivationsUsager 
                nomUsager={nomUsager}
                workers={workers}
                supportCodeQr={supportCodeQr}
                csrCb={csrCb}
                erreurCb={erreurCb} />
        </ErrorBoundary>

        <br/>

        <Form.Group>
            <Form.Text className="text-muted">
                Saisissez un code et cliquez sur Activer.
            </Form.Text>
        </Form.Group>
        <BoutonActif 
            onClick={activerCodeCb} 
            etat={resultatActivation}
            disabled={!csr || !etatPret}>
            Activer
        </BoutonActif>
      </>
    )
}
import { useState, useCallback, useEffect  } from 'react'
import Alert from 'react-bootstrap/Alert'
import Button from 'react-bootstrap/Button'
import Row from 'react-bootstrap/Row'
import Col from 'react-bootstrap/Col'
import Form from 'react-bootstrap/Form'

import { base64 } from 'multiformats/bases/base64'

import { AfficherActivationsUsager, supporteCamera } from '@dugrema/millegrilles.reactjs'

import {BoutonAjouterWebauthn, preparerAuthentification, signerDemandeAuthentification} from './WebAuthn'

function SectionActiverCompte(props) {
    const {workers, usagerDbLocal, etatAuthentifie, setSectionGestion, confirmationCb, fermer, erreurCb} = props

    const retourCb = useCallback(()=>setSectionGestion(''), [setSectionGestion])

    return (
        <>
            <Row>
                <Col xs={10} md={11}><h2>Activer un appareil</h2></Col>
                <Col xs={2} md={1} className="bouton"><Button onClick={fermer} variant="secondary"><i className='fa fa-remove'/></Button></Col>
            </Row>

            <p>
                Cette section permet d'activer votre compte sur un autre appareil ou site lie a cette MilleGrille.
            </p>

            <ActivationUsager 
                etatAuthentifie={etatAuthentifie}
                usagerDbLocal={usagerDbLocal}
                workers={workers}
                confirmationCb={confirmationCb}
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

    const { workers, usagerDbLocal, confirmationCb, erreurCb, etatAuthentifie } = props
    const { nomUsager } = usagerDbLocal
  
    const [supportCodeQr, setSupportCodeQr] = useState(false)
    const [csr, setCsr] = useState('')
    const [etatUsagerBackend, setEtatUsagerBackend] = useState('')
    const [preparationWebauthn, setPreparationWebauthn] = useState('')

    const csrCb = useCallback(csr=>{
      console.debug("Recu csr : %O", csr)
      setCsr(csr)
    }, [setCsr])
  
    const activerCodeCb = useCallback(()=>{
        // console.debug("Signer CSR de l'usager %O", etatUsagerBackend)
        const {connexion} = workers
        const challengeWebauthn = etatUsagerBackend.challengeWebauthn
        const {demandeCertificat, publicKey} = preparationWebauthn
        const origin = window.location.hostname
        signerDemandeAuthentification(nomUsager, challengeWebauthn, demandeCertificat, publicKey, {connexion})
            .then(async signatureWebauthn => {
                // console.debug("Resultat signature webauthn : %O", signatureWebauthn)

                const commande = {
                    demandeCertificat: signatureWebauthn.demandeCertificat,
                    clientAssertionResponse: signatureWebauthn.webauthn,
                    origin,
                    challenge: base64.encode(publicKey.challenge),
                }

                //console.debug("Commande demande signature : %O", commande)
                const reponse = await connexion.signerRecoveryCsr(commande)
                // console.debug("Reponse signature certificat : %O", reponse)

                if(reponse.err) erreurCb(reponse.err, "Erreur lors de l'activation du code")
                else confirmationCb('Code active avec succes.')
            })
            .catch(err=>erreurCb(err))
    }, [workers, nomUsager, etatUsagerBackend, preparationWebauthn, confirmationCb, erreurCb])

    useEffect(()=>{
      supporteCamera()
        .then(support=>setSupportCodeQr(support))
        .catch(err=>erreurCb(err))
    }, [setSupportCodeQr, erreurCb])
  
    useEffect(()=>{
        const { connexion } = workers
        connexion.getInfoUsager(nomUsager)
            .then(etatUsagerBackend=>{
                // console.debug("Etat usager backend charge : %O", etatUsagerBackend)
                setEtatUsagerBackend(etatUsagerBackend)
            })
            .catch(err=>erreurCb(err))
    }, [workers, nomUsager, setEtatUsagerBackend, erreurCb])

    // Charger le nom de l'usager dans le CSR
    useEffect(()=>{
        if(csr) {
            // const nomUsagerCsr = getNomUsagerCsr(csr)
            // setNomUsagerCsr(nomUsagerCsr)

            // console.debug("Preparation challenge reponse pour CSR %O : %O", csr, etatUsagerBackend)
            const challenge = etatUsagerBackend.challengeWebauthn

            // Preparer la validation avec webauthn
            preparerAuthentification(nomUsager, challenge, csr, {activationTierce: true})
                .then(resultat=>{
                    // console.debug("Resultat preparation authentification: %O", resultat)
                    setPreparationWebauthn(resultat)
                })
                .catch(err=>erreurCb(err))
        }
    }, [nomUsager, csr, etatUsagerBackend, setPreparationWebauthn, erreurCb])

    return (
      <>
        <h2>Activer compte</h2>
        <AfficherActivationsUsager 
          nomUsager={nomUsager}
          workers={props.workers}
          supportCodeQr={supportCodeQr}
          csrCb={csrCb}
          erreurCb={erreurCb} />

        <br/>

        <Form.Group>
            <Form.Text className="text-muted">
                Saisissez un code et cliquez sur Activer.
            </Form.Text>
        </Form.Group>
        <Button onClick={activerCodeCb} disabled={!csr || !etatAuthentifie}>Activer</Button>
      </>
    )
}
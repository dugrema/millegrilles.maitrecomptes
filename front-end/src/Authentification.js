import React from 'react'
import './App.css'
import 'bootstrap/dist/css/bootstrap.min.css'
import {Button, Form, Container, Row, Col, Nav} from 'react-bootstrap'
import axios from 'axios'
import {createHash} from 'crypto'
import u2f from 'u2f-api-polyfill'

export class Authentifier extends React.Component {

  state = {
    nomUsager: '',
    attendreVerificationUsager: false,
    usagerVerifie: false,
    etatUsager: '',
    u2fAuthRequest: '',
  }

  componentDidMount() {
    console.debug("Chargement component")

    // Verifier si on a un nom d'usager dans local storage
    axios.get('/authentification/verifier')
    .then(reponse =>{
      console.debug("Reponse verification cookie session")
      console.debug(reponse)

      // Conserver le nom de l'usager, redirige vers la liste des applications disponibles
      const nomUsager = reponse.headers['user-prive']
      this.props.setNomUsagerAuthentifie(nomUsager)
    })
    .catch(err=>{
      const statusCode = err.response.status
      if(statusCode === 401) {
        console.debug("Usager non authentifie")
      } else {
        console.error("Erreur verification cookie session, status code %s", statusCode)
        console.error(err)
      }
    })
  }

  boutonUsagerSuivant = (event) => {
    console.debug("Authentifier")
    this.setState({usagerVerifie: true})  // TODO: Faire une vraie verif

    axios.post('/authentification/verifierUsager', 'nom-usager='+this.state.nomUsager)
    .then(response=>{
      console.debug(response)

      const update = {
        etatUsager: 'connu'
      }
      if(response.data.authRequest) {
        update.u2fAuthRequest = response.data.authRequest
      }

      this.setState(update)
    })
    .catch(err=>{
      const statusCode = err.response.status
      if(statusCode === 401) {
        console.debug("Usager inconnu")
        this.setState({etatUsager: 'inconnu'})
      } else {
        console.error("Erreur verification usager")
        console.error(err);
      }
    })

  }

  changerNomUsager = (event) => {
    const {value} = event.currentTarget
    this.setState({nomUsager: value})
  }

  render() {

    let formulaire;
    if(!this.state.usagerVerifie) {
      formulaire = <SaisirUsager boutonUsagerSuivant={this.boutonUsagerSuivant} changerNomUsager={this.changerNomUsager} nomUsager={this.state.nomUsager} />
    } else {
      if(this.state.etatUsager === 'connu') {
        formulaire = <AuthentifierUsager nomUsager={this.state.nomUsager} redirectUrl={this.props.redirectUrl} idmg={this.props.idmg} u2fAuthRequest={this.state.u2fAuthRequest}/>
      } else if (this.state.etatUsager === 'inconnu') {
        formulaire = <InscrireUsager nomUsager={this.state.nomUsager} redirectUrl={this.props.redirectUrl} idmg={this.props.idmg}/>
      } else {
        formulaire = <AttendreVerificationUsager />
      }
    }

    return (
      <Container>
        <Row>
          <Col sm={2} md={3}></Col>
          <Col sm={8} md={6}>
            {formulaire}
          </Col>
          <Col sm={2} md={3}></Col>
        </Row>
      </Container>
    )

  }
}

function AttendreVerificationUsager() {
  return (
    <p>Attendre verification de votre nom d'usager</p>
  )
}

function SaisirUsager(props) {
  return (
    <Form>
      <Form.Group controlId="formNomUsager">
        <Form.Label>Nom d'usager</Form.Label>
        <Form.Control
          type="email"
          placeholder="Saisissez votre nom d'usager ici"
          value={props.nomUsager}
          onChange={props.changerNomUsager} />
        <Form.Text className="text-muted">
            Si vous voulez creer un nouveau compte, entrez votre nom d'usager desire et cliquez sur Suivant.
        </Form.Text>
      </Form.Group>

      <Button onClick={props.boutonUsagerSuivant}>Suivant</Button>
    </Form>
  )
}

class AuthentifierUsager extends React.Component {

  state = {
    motdepasse: '',
    motdepasseHash: '',
    u2fClientData: '',
    u2fSignatureData: '',
  }

  changerMotdepasse = event => {
    const {value} = event.currentTarget;

    // var motdepasseHash = createHash('sha256').update(value, 'utf-8').digest('base64')

    this.setState({
      motdepasse: value,
      // motdepasseHash,
    })
  }

  authentifier = event => {
    const {form} = event.currentTarget;
    const authRequest = this.props.u2fAuthRequest

    if(authRequest) {
      // Effectuer la verification avec cle U2F puis soumettre
      window.u2f.sign(authRequest.appId, authRequest.challenge, [authRequest], (authResponse) => {
        // Send this authentication response to the authentication verification server endpoint
        console.debug("Response authentification")
        console.debug(authResponse)

        this.setState({
          u2fClientData: authResponse.clientData,
          u2fSignatureData: authResponse.signatureData,
        }, ()=>{
          form.submit()
        })

      });
    } else {
      var motdepasseHash = createHash('sha256').update(this.state.motdepasse, 'utf-8').digest('base64')
      this.setState({
        motdepasseHash
      }, ()=>{
        form.submit()
      })
    }
  }

  componentDidMount() {
    // console.debug("Redirect url : " + this.props.redirectUrl)
  }

  render() {

    // Set params hidden : nom usager, url redirection au besoin
    const hiddenParams = [
      <Form.Control key="nomUsager" type="hidden" name="nom-usager" value={this.props.nomUsager} />,
      <Form.Control key="motdepasseHash" type="hidden" name="motdepasse-hash" value={this.state.motdepasseHash} />,
    ]
    if(this.props.redirectUrl) {
      hiddenParams.push(<Form.Control key="redirectUrl" type="hidden" name="url" value={this.props.redirectUrl} />)
    }
    if(this.state.u2fClientData) {
      hiddenParams.push(<Form.Control key="u2fClientData" type="hidden" name="u2f-client-data" value={this.state.u2fClientData} />)
    }
    if(this.state.u2fSignatureData) {
      hiddenParams.push(<Form.Control key="u2fSignatureData" type="hidden" name="u2f-signature-data" value={this.state.u2fSignatureData} />)
    }

    let formulaire;
    if(this.props.u2fAuthRequest) {
      formulaire = (
        <p>Inserer la cle U2F et cliquer sur suivant.</p>
      )
    } else {
      // Mot de passe
      formulaire = (
        <Form.Group controlId="formMotdepasse">
          <Form.Label>Mot de passe</Form.Label>
          <Form.Control
            type="password"
            name="motdepasse"
            value={this.state.motdepasse}
            onChange={this.changerMotdepasse}
            placeholder="Saisir votre mot de passe" />
        </Form.Group>
      )
    }

    return (
      <Form method="post" action="/authentification/ouvrir">

        <p>Usager : {this.props.nomUsager}</p>

        {formulaire}

        {hiddenParams}

        <Button onClick={this.authentifier}>Suivant</Button>

      </Form>
    )
  }

}

class InscrireUsager extends React.Component {

  state = {
    typeAuthentification: 'u2f',
    motdepasse: '',
    motdepasse2: '',
    motdepasseHash: '',
    u2fClientData: '',
    u2fRegistrationData: '',
  }

  changerMotdepasse = event => {
    const {value} = event.currentTarget

    var motdepasseHash = createHash('sha256').update(value, 'utf-8').digest('base64')

    this.setState({
      motdepasse: value,
      motdepasseHash,
    })

  }

  changerMotdepasse2 = event => {
    const {value} = event.currentTarget;
    this.setState({motdepasse2: value})
  }

  changerTypeAuthentification = selectedType => {
    console.debug("Changer type authentification : %s", selectedType)
    this.setState({typeAuthentification: selectedType})
  }

  inscrire = event => {
    const {form} = event.currentTarget

    if(this.state.typeAuthentification === 'motdepasse') {
      form.submit()
    } else if(this.state.typeAuthentification === 'u2f') {
      axios.get('/authentification/getChallengeRegistrationU2f')
      .then(reponse=>{
        console.debug("Reponse prep U2F")
        console.debug(reponse)

        const {registrationRequest, replyId} = reponse.data

        console.debug("Registration request")
        console.debug(registrationRequest)

        window.u2f.register(registrationRequest.appId, [registrationRequest], [], (registrationResponse) => {
          // Send this registration response to the registration verification server endpoint
          console.debug("Registration response")
          console.debug(registrationResponse)

          if(registrationResponse.errorCode) {
            var erreur = null
            for(let key in window.u2f.ErrorCodes) {
              const code = window.u2f.ErrorCodes[key]
              if(code === registrationResponse.errorCode) {
                erreur = key
                break
              }
            }

            console.error("Erreur d'enregistrement U2F, %s (%d)", erreur, registrationResponse.errorCode)
            return
          }

          // Transmettre formulaire avec le code
          this.setState({
            u2fClientData: registrationResponse.clientData,
            u2fRegistrationData: registrationResponse.registrationData,
            u2fReplyId: replyId,
          }, ()=>{
            form.submit()
          })
        })
      })
      .catch(err=>{
        console.error("Erreur requete challenge U2F")
        console.error(err)
      })
    }
  }

  componentDidMount() {
    // console.debug("Redirect url : " + this.props.redirectUrl)

    console.debug("Salt : %s, iterations : %s", this.state.salt, this.state.iterations)
  }

  render() {

    // Set params hidden : nom usager, url redirection au besoin
    const hiddenParams = [
      <Form.Control key="nomUsager" type="hidden" name="nom-usager" value={this.props.nomUsager} />,
      <Form.Control key="typeAuthentification" type="hidden" name="type-authentification" value={this.state.typeAuthentification} />,
    ]
    if(this.state.motdepasseHash) {
      hiddenParams.push(<Form.Control key="motdepasseHash" type="hidden" name="motdepasse-hash" value={this.state.motdepasseHash} />)
    }
    if(this.props.redirectUrl) {
      hiddenParams.push(<Form.Control key="redirectUrl" type="hidden" name="url" value={this.props.redirectUrl} />)
    }
    if(this.state.u2fClientData) {
      hiddenParams.push(<Form.Control key="u2fClientData" type="hidden" name="u2f-client-data" value={this.state.u2fClientData} />)
    }
    if(this.state.u2fRegistrationData) {
      hiddenParams.push(<Form.Control key="u2fRegistrationData" type="hidden" name="u2f-registration-data" value={this.state.u2fRegistrationData} />)
    }
    if(this.state.u2fReplyId) {
      hiddenParams.push(<Form.Control key="u2fReplyId" type="hidden" name="u2f-reply-id" value={this.state.u2fReplyId} />)
    }

    let subform;
    if (this.state.typeAuthentification === 'motdepasse' ) {
      subform = (
        <Form.Group controlId="formMotdepasse">
          <Form.Label>Mot de passe</Form.Label>
          <Form.Control
            type="password"
            name="motdepasse"
            value={this.state.motdepasse}
            onChange={this.changerMotdepasse}
            placeholder="Saisir votre mot de passe" />
          <Form.Control
            type="password"
            name="motdepasse2"
            value={this.state.motdepasse2}
            onChange={this.changerMotdepasse2}
            placeholder="Saisir votre mot de passe a nouveau" />
        </Form.Group>
      )
    } else if(this.state.typeAuthentification === 'u2f' ) {
      subform = (
        <div>
          <p>
            Preparez votre cle de securite USB FIDO2/U2F, cliquez sur Inscrire et suivez les instructions a l'ecran.
          </p>
          <p>
            Si vous n'avez pas de cle USB FIDO2/U2F, vous pouvez utiliser un mot de passe (moins securitaire).
          </p>
        </div>
      )
    }

    return (
      <Form method="post" action="/authentification/inscrire">
        {hiddenParams}

        <p>Creer un nouveau compte sur cette MilleGrille</p>
        <p>Usager : {this.props.nomUsager}</p>

        <Nav variant="tabs" defaultActiveKey="u2f" onSelect={this.changerTypeAuthentification}>
          <Nav.Item>
            <Nav.Link eventKey="u2f">USB</Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link eventKey="motdepasse">Mot de passe</Nav.Link>
          </Nav.Item>
        </Nav>

        <Container className="boite-coinsronds boite-authentification">
          {subform}
        </Container>

        <Button onClick={this.inscrire}>Inscrire</Button>

      </Form>
    )
  }

}

import React from 'react'
import {Button, Form, Container, Row, Col, Nav} from 'react-bootstrap'
import axios from 'axios'
import {createHash} from 'crypto'
import {solveRegistrationChallenge, solveLoginChallenge} from '@webauthn/client'

export class Authentifier extends React.Component {

  state = {
    nomUsager: '',
    attendreVerificationUsager: false,
    usagerVerifie: false,
    etatUsager: '',
    authRequest: '',
    challengeId: '',
    motdepassePresent: false,
    u2fRegistrationJson: '',
  }

  componentDidMount() {
    // console.debug("Chargement component")

    // Verifier si on a un nom d'usager dans local storage
    axios.get(this.props.authUrl + '/verifier')
    .then(reponse =>{
      // console.debug("Reponse verification cookie session")
      // console.debug(reponse)

      // Conserver le nom de l'usager, redirige vers la liste des applications disponibles
      const nomUsager = reponse.headers['user-prive']
      this.props.setNomUsagerAuthentifie(nomUsager)
    })
    .catch(err=>{
      if(err.response) {
        const statusCode = err.response.status
        if(statusCode === 401) {
          console.debug("Usager non authentifie")
        } else {
          console.error("Erreur verification cookie session, status code %s", statusCode)
          console.error(err)
        }
      } else {
        console.error("Erreur connexion serveur")
        console.error(err)
      }
    })
  }

  // Authentification du proprietaire
  boutonOuvrirProprietaire = event => {
    console.debug("Submit authentifier proprietaire")
    event.preventDefault()
    event.stopPropagation()
    const form = event.currentTarget;

    axios.post(this.props.authUrl + '/challengeProprietaire')
    .then(reponse=>{
      console.debug("Reponse U2F challenge")
      console.debug(reponse)
      const {authRequest, challengeId} = reponse.data
      solveLoginChallenge(authRequest)
      .then(credentials=>{
        const u2fAuthRequest = JSON.stringify(credentials)
        this.setState({authRequest: u2fAuthRequest, challengeId}, ()=>{
          console.debug("Challenge pret, submit")
          console.debug(this.state)
          form.submit()
        })
      })
      .catch(err=>{
        console.error("Erreur authentification proprietaire")
        console.error(err)
      })
    })
    .catch(err=>{
      console.error("Erreur requete challenge U2F proprietaire")
      console.error(err)
    })
  }

  boutonUsagerSuivant = (event) => {
    // console.debug("Authentifier")

    const params = new URLSearchParams()
    params.set('nom-usager', this.state.nomUsager)

    axios.post(this.props.authUrl + '/verifierUsager', params.toString())
    .then(response=>{
      // console.debug(response)
      const update = {
        etatUsager: 'connu',
        usagerVerifie: true,
        ...response.data
      }
      // console.debug(update)

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

  annuler = event => {
    this.setState({usagerVerifie: false, attendreVerificationUsager: false,})
  }

  actionPrendrePossession = event => {
    console.debug("Submit prendre possession")
    event.preventDefault()
    event.stopPropagation()
    const form = event.currentTarget

    var params = 'nom-usager=proprietaire'

    axios.post(this.props.authUrl + '/challengeRegistrationU2f', params)
    .then(reponse=>{
      console.debug("Reponse U2F challenge")
      console.debug(reponse)
      const {registrationRequest, challengeId} = reponse.data
      solveRegistrationChallenge(registrationRequest)
      .then(credentials=>{
        const u2fRegistrationJson = JSON.stringify(credentials)
        this.setState({u2fRegistrationJson, challengeId}, ()=>{
          console.debug("Challenge pret, submit")
          console.debug(this.state)
          form.submit()
        })
      })
      .catch(err=>{
        console.error("Erreur registration")
        console.error(err)
      })
    })
    .catch(err=>{
      console.error("Erreur requete challenge U2F")
      console.error(err)
    })
  }

  render() {

    let formulaire;
    if(!this.props.rootProps.proprietairePresent) {
      // Nouvelle MilleGrille, on presente le bouton de prise de possession
      formulaire =
        <PrendrePossession
          authUrl={this.props.authUrl}
          u2fRegistrationJson={this.state.u2fRegistrationJson}
          challengeId={this.state.challengeId}
          actionPrendrePossession={this.actionPrendrePossession} />
    } else if(!this.state.usagerVerifie) {
      formulaire =
        <SaisirUsager
          authUrl={this.props.authUrl}
          boutonUsagerSuivant={this.boutonUsagerSuivant}
          changerNomUsager={this.changerNomUsager}
          nomUsager={this.state.nomUsager}
          boutonOuvrirProprietaire={this.boutonOuvrirProprietaire}
          u2fAuthRequest={this.state.authRequest}
          challengeId={this.state.challengeId} />
    } else {
      if(this.state.etatUsager === 'connu') {
        formulaire =
          <AuthentifierUsager
            annuler={this.annuler}
            nomUsager={this.state.nomUsager}
            redirectUrl={this.props.redirectUrl}
            authUrl={this.props.authUrl}
            idmg={this.props.idmg}
            u2fAuthRequest={this.state.authRequest}
            challengeId={this.state.challengeId}
            motdepassePresent={this.state.motdepassePresent}/>
      } else if (this.state.etatUsager === 'inconnu') {
        formulaire =
          <InscrireUsager
            annuler={this.annuler}
            nomUsager={this.state.nomUsager}
            authUrl={this.props.authUrl}
            redirectUrl={this.props.redirectUrl}
            idmg={this.props.idmg} />
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
    <Container className="form-login">
      <Row>
        <Col>
          <p>Acces protege pour le proprietaire avec cle de securite</p>
          <Form method="POST" onSubmit={props.boutonOuvrirProprietaire} action={props.authUrl + '/ouvrirProprietaire'}>
            <Form.Control key="redirectUrl" type="hidden"
              name="url" value={props.redirectUrl} />
            <Form.Control key="u2fClientJson" type="hidden"
              name="u2f-client-json" value={props.u2fAuthRequest} />
            <Form.Control key="u2fChallengeId" type="hidden"
              name="u2f-challenge-id" value={props.challengeId} />
            <Button type="submit" variant="success">Acces proprietaire</Button>
          </Form>
        </Col>
      </Row>

      <Row>
        <Col>
          <p>Acces prive pour les usagers de la MilleGrille</p>
          <Form>
            <Form.Group controlId="formNomUsager">
              <Form.Label>Nom d'usager</Form.Label>
              <Form.Control
                type="text"
                placeholder="Saisissez votre nom d'usager ici"
                value={props.nomUsager}
                onChange={props.changerNomUsager} />
              <Form.Text className="text-muted">
                  Si vous voulez creer un nouveau compte, entrez votre nom d'usager desire et cliquez sur Suivant.
              </Form.Text>
            </Form.Group>

            <Button onClick={props.boutonUsagerSuivant} disabled={!props.nomUsager}>Suivant</Button>
          </Form>
        </Col>
      </Row>

    </Container>
  )
}

function PrendrePossession(props) {
  return (
    <Container>
      <Form method="POST" onSubmit={props.actionPrendrePossession} action={props.authUrl + '/prendrePossession'}>
        <Form.Control type="hidden" name="nom-usager" value="proprietaire" />
        <Form.Control type="hidden"
            name="u2f-registration-json" value={props.u2fRegistrationJson} />
        <Form.Control type="hidden"
            name="u2f-challenge-id" value={props.challengeId} />
        <Button type="submit">Prendre possession</Button>
      </Form>
    </Container>
  )
}

class AuthentifierUsager extends React.Component {

  state = {
    motdepasse: '',
    motdepasseHash: '',
    u2fClientJson: '',
    typeAuthentification: 'u2f',
  }

  componentDidMount() {
    var defaultKey = null;
    if(this.props.u2fAuthRequest) {
      defaultKey = 'u2f'
    }
    else {
      defaultKey = 'motdepasse'
    }
    this.setState({typeAuthentification: defaultKey})
  }

  changerMotdepasse = event => {
    const {value} = event.currentTarget;

    this.setState({
      motdepasse: value,
    })
  }

  authentifier = event => {
    const {form} = event.currentTarget;
    const authRequest = this.props.u2fAuthRequest

    if(this.state.typeAuthentification === 'u2f') {
      // Effectuer la verification avec cle U2F puis soumettre
      // console.debug("Auth request")
      // console.debug(authRequest)

      solveLoginChallenge(authRequest)
      .then(credentials=>{
        // console.debug("Credentials")
        // console.debug(credentials)

        const u2fClientJson = JSON.stringify(credentials)
        this.setState({u2fClientJson}, ()=>{
          form.submit()
        })
      })
      .catch(err=>{
        console.error("Erreur challenge reply registration security key");
        console.error(err);
      });

    } else if(this.state.typeAuthentification === 'motdepasse') {
      var motdepasseHash = createHash('sha256').update(this.state.motdepasse, 'utf-8').digest('base64')
      this.setState({
        motdepasse: '', // Reset mot de passe (eviter de le transmettre en clair)
        motdepasseHash,
      }, ()=>{
        form.submit()
      })
    }
  }

  changerTypeAuthentification = selectedType => {
    // console.debug("Changer type authentification : %s", selectedType)
    this.setState({typeAuthentification: selectedType})
  }

  render() {

    // Set params hidden : nom usager, url redirection au besoin
    const hiddenParams = [
    ]
    if(this.props.redirectUrl) {
      hiddenParams.push(<Form.Control key="redirectUrl" type="hidden"
        name="url" value={this.props.redirectUrl} />)
    }
    if(this.state.u2fClientJson) {
      hiddenParams.push(<Form.Control key="u2fClientJson" type="hidden"
        name="u2f-client-json" value={this.state.u2fClientJson} />)
    }
    if(this.props.challengeId) {
      hiddenParams.push(<Form.Control key="u2fChallengeId" type="hidden"
        name="u2f-challenge-id" value={this.props.challengeId} />)
    }

    let formulaire;
    if(this.state.typeAuthentification === 'u2f') {
      formulaire = (
        <p>Inserer la cle U2F et cliquer sur suivant.</p>
      )
    } else if(this.state.typeAuthentification === 'motdepasse') {
      // Mot de passe
      // name="" pour eviter de soumettre le mot de passe en clair
      formulaire = (
        <Form.Group controlId="formMotdepasse">
          <Form.Label>Mot de passe</Form.Label>
          <Form.Control
            type="password"
            name=""
            value={this.state.motdepasse}
            autoComplete="current-password"
            onChange={this.changerMotdepasse}
            placeholder="Saisir votre mot de passe" />
        </Form.Group>
      )
    }

    return (
      <Form method="post" action={this.props.authUrl + "/ouvrir"}>

        <Form.Control type="text" name="nom-usager" autoComplete="username"
          defaultValue={this.props.nomUsager} className="champ-cache"/>
        <Form.Control type="hidden" name="motdepasse-hash"
          value={this.state.motdepasseHash} />

        <p>Usager : {this.props.nomUsager}</p>

        <Nav variant="tabs" activeKey={this.state.typeAuthentification} onSelect={this.changerTypeAuthentification}>
          <Nav.Item>
            <Nav.Link eventKey="u2f" disabled={!this.props.u2fAuthRequest}>U2F</Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link eventKey="motdepasse" disabled={!this.props.motdepassePresent}>Mot de passe</Nav.Link>
          </Nav.Item>
        </Nav>

        <Container className="boite-coinsronds boite-authentification">
          {formulaire}
        </Container>

        {hiddenParams}

        <Button onClick={this.authentifier}>Suivant</Button>
        <Button onClick={this.props.annuler} variant="secondary">Annuler</Button>

      </Form>
    )
  }

}

class InscrireUsager extends React.Component {

  state = {
    typeAuthentification: 'u2f',
  }

  changerTypeAuthentification = selectedType => {
    // console.debug("Changer type authentification : %s", selectedType)
    this.setState({typeAuthentification: selectedType})
  }

  render() {

    // Set params hidden : nom usager, url redirection au besoin
    const optHiddenParams = []
    if(this.props.redirectUrl) {
      optHiddenParams.push(<Form.Control key="redirectUrl" type="hidden"
        name="url" value={this.props.redirectUrl} />)
    }

    let subform;
    if (this.state.typeAuthentification === 'motdepasse' ) {
      subform = <NouveauMotdepasse nomUsager={this.props.nomUsager} />
    } else if(this.state.typeAuthentification === 'u2f' ) {
      subform = <EnregistrerU2f nomUsager={this.props.nomUsager} />
    }

    return (
      <Form method="post" action={this.props.authUrl + "/inscrire"}>
        <Form.Control type="text" name="nom-usager" autoComplete="username"
          defaultValue={this.props.nomUsager} className="champ-cache" />
        <Form.Control type="hidden" name="type-authentification"
          value={this.state.typeAuthentification} />

        {optHiddenParams}

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
        <Button onClick={this.props.annuler} variant="secondary">Annuler</Button>

      </Form>
    )
  }

}

class EnregistrerU2f extends React.Component {

  state = {
    u2fRegistrationJson: '',
    u2fReplyId: '',
  }

  inscrireU2f = event => {
    const {form} = event.currentTarget

    var params = '';
    if(this.props.nomUsager) {
      params = 'nom-usager=' + this.props.nomUsager
    }
    // console.debug("Params : %s", params)

    axios.post(this.props.authUrl + '/challengeRegistrationU2f', params)
    .then(reponse=>{
      const {registrationRequest, challengeId: u2fReplyId} = reponse.data
      solveRegistrationChallenge(registrationRequest)
      .then(credentials=>{
        const u2fRegistrationJson = JSON.stringify(credentials)
        this.setState({u2fRegistrationJson, u2fReplyId}, ()=>{
          form.submit()
        })
      })
      .catch(err=>{
        console.error("Erreur registration")
        console.error(err)
      })
    })
    .catch(err=>{
      console.error("Erreur requete challenge U2F")
      console.error(err)
    })
  }

  render() {
    return (
      <div>
        <Form.Control key="u2fReplyId" type="hidden"
            name="u2f-challenge-id" value={this.state.u2fReplyId} />

        <Form.Control key="u2fRegistrationJson" type="hidden"
            name="u2f-registration-json" value={this.state.u2fRegistrationJson} />

        <div>
          <p>
            Preparez votre cle de securite USB FIDO2/U2F, cliquez sur Inscrire et suivez les instructions a l'ecran.
          </p>
          <p>
            Si vous n'avez pas de cle USB FIDO2/U2F, vous pouvez utiliser un mot de passe (moins securitaire).
          </p>
        </div>

        <Button onClick={this.inscrireU2f}>Inscrire</Button>

      </div>
    )
  }

}

export class NouveauMotdepasse extends React.Component {

  state = {
    motdepasse: '',
    motdepasse2: '',
    motdepasseMatch: false,
    motdepasseHash: '',
  }

  changerMotdepasse = event => {
    const {value} = event.currentTarget

    const motdepasseMatch = value === this.state.motdepasse2;

    this.setState({
      motdepasse: value,
      motdepasseMatch,
    })

  }

  changerMotdepasse2 = event => {
    const {value} = event.currentTarget;
    const motdepasseMatch = value === this.state.motdepasse;
    this.setState({motdepasse2: value, motdepasseMatch})
  }

  inscrire = event => {
    const {form} = event.currentTarget

    const motdepasse = this.state.motdepasse
    var motdepasseHash = createHash('sha256').update(motdepasse, 'utf-8').digest('base64')

    this.setState({
      motdepasseHash,
      motdepasse:'', motdepasse2:'', // Reset mot de passe (eviter de le transmettre en clair)
    }, ()=>{
      if(this.props.submit) {
        // Submit avec methode fournie - repackager event pour transmettre form
        this.props.submit({currentTarget: {form}})
      } else {
        form.submit()
      }
    })
  }

  render() {

    // name="" pour eviter de soumettre le mot de passe en clair
    return (
      <div>
        <Form.Control key="motdepasseHash" type="hidden"
          name="motdepasse-hash" value={this.state.motdepasseHash} />

        <Form.Group controlId="formMotdepasse">
          <Form.Label>Nouveau mot de passe</Form.Label>
          <Form.Control
            type="password"
            name=""
            value={this.state.motdepasse}
            autoComplete="new-password"
            onChange={this.changerMotdepasse}
            placeholder="Saisir votre nouveau mot de passe" />
        </Form.Group>

        <Form.Group controlId="formMotdepasse2">
          <Form.Control
            type="password"
            name=""
            value={this.state.motdepasse2}
            autoComplete="new-password"
            onChange={this.changerMotdepasse2}
            placeholder="Saisir votre nouveau mot de passe a nouveau" />
        </Form.Group>

        <Button onClick={this.inscrire}
          disabled={ ! this.state.motdepasseMatch }>Inscrire</Button>
      </div>
    )
  }
}

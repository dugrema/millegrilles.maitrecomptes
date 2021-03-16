import React from 'react'
import {Container, Row, Col} from 'react-bootstrap'
import QRCode from 'qrcode.react'
import {mettreAJourCertificatNavigateur, resetCertificatPem} from '../components/pkiHelper'
import {getCertificats, getClesPrivees, getCsr} from '@dugrema/millegrilles.common/lib/browser/dbUsager'

import {wrap as comlinkWrap, proxy as comlinkProxy, releaseProxy} from 'comlink'

import { LayoutMillegrilles } from './Layout'
import {Applications} from './Applications'
import {Authentifier, modalAuthentification} from './Authentification'
import { ModalAuthentification, chargerInformationAuthentification } from './UpgradeProtege'

import { splitPEMCerts } from '@dugrema/millegrilles.common/lib/forgecommon'

/* eslint-disable-next-line */
import WebWorker from 'worker-loader!@dugrema/millegrilles.common/lib/browser/chiffrage.worker'
import ConnexionWorker from '../workers/connexion.worker'

import '../components/i18n'
import './App.css'

const MG_URL_API = '/millegrilles/api'
const MG_URL_AUTHENTIFICATION = '/millegrilles/authentification'
const MG_SOCKETIO_URL = '/millegrilles/socket.io'

export default class App extends React.Component {

  state = {
    nomUsager: '',
    estProprietaire: false,
    idmgServeur: '',
    idmgCompte: '',
    proprietairePresent: true,
    titreMillegrille: '',
    showModalAuthentification: false,

    page: '',
    sousMenuApplication: null,
    footerFige: false,

    connexionSocketIo: null,
    // webSocketApp: null,
    modeProtege: false,

    webWorker: '',
    signateurTransaction: '',

    cleMillegrillePresente: false,
  }

  componentDidMount() {
    this.chargerWebWorkers()
  }

  componentWillUnmount() {
    try {
      if(this.state.webWorker) {
        console.debug("Nettoyage worker chiffrage, release proxy")
        this.state.webWorker[releaseProxy]()
        this.state.webWorkerInstance.terminate()
        this.setState({webWorker: null, webWorkerInstance: null})
      }
    } catch(err) {console.error("Erreur fermeture worker chiffrage")}

    try {
      if(this.state.connexionWorker) {
        console.debug("Nettoyage worker, connexion release proxy")
        this.state.connexionWorker[releaseProxy]()
        this.state.connexionWorkerInstance.terminate()
        this.setState({connexionWorker: null, connexionWorkerInstance: null})
      }
    } catch(err) {console.error("Erreur fermeture worker chiffrage")}
  }

  async chargerWebWorkers() {
    Promise.all([
      this.initialiserWorkerChiffrage(),
      this.initialiserConnexion()
    ]).then(_=>{
      console.debug("Workers prets")
    }).catch(err=>{
      console.error("Erreur prep workers : %O", err)
    })
  }

  async initialiserWorkerChiffrage() {
    try {
      const worker = new WebWorker()
      const proxy = await comlinkWrap(worker)
      this.setState({
        webWorkerInstance: worker,
        webWorker: proxy,
        signateurTransaction: {preparerTransaction: proxy.formatterMessage}, // Legacy
      })

      const cbCleMillegrille = comlinkProxy(this.callbackCleMillegrille)
      proxy.initialiserCallbackCleMillegrille(cbCleMillegrille)

    } catch(err) {
      console.error("Erreur initilisation worker chiffrate : %O", err)
    }
  }

  async initialiserConnexion() {
    const connexionWorkerInstance = new ConnexionWorker()
    const connexionProxy = await comlinkWrap(connexionWorkerInstance)

    this.setState({
      connexionWorkerInstance,
      connexionWorker: connexionProxy,
    }, async _=>{
      try {
        await this.chargerInformationMillegrille()

        // await connexionProxy.connecter({DEBUG: true})
      } catch(err) {
        console.error("Erreur test worker connexion : %O", err)
      }
    })

  }

  callbackCleMillegrille = async clePresente => {
    console.debug("Callback etat cle de MilleGrille, cle presente : %s", clePresente)
    this.setState({cleMillegrillePresente: clePresente === true})
  }

  async chargerInformationMillegrille() {
    const infoMillegrille = await this.state.connexionWorker.getInformationMillegrille()
    const titreMillegrille = infoMillegrille.titre || 'MilleGrille'

    _setTitre(titreMillegrille)

    this.setState({
      idmgServeur: infoMillegrille.idmg,
      titreMillegrille,
      proprietairePresent: infoMillegrille.proprietairePresent,
    })
  }

  async preparerWorkersAvecCles() {
    const {nomUsager, webWorker, connexionWorker} = this.state

    // Initialiser certificat de MilleGrille et cles si presentes
    const certInfo = await getCertificats(nomUsager)
    if(certInfo && certInfo.fullchain) {
      const fullchain = splitPEMCerts(certInfo.fullchain)
      const clesPrivees = await getClesPrivees(nomUsager)

      // Initialiser le CertificateStore
      await webWorker.initialiserCertificateStore([...fullchain].pop(), {isPEM: true, DEBUG: false})
      console.debug("Certificat : %O, Cles privees : %O", certInfo.fullchain, clesPrivees)

      // Initialiser web worker
      await webWorker.initialiserFormatteurMessage({
        certificatPem: certInfo.fullchain,
        clePriveeSign: clesPrivees.signer,
        clePriveeDecrypt: clesPrivees.dechiffrer,
        DEBUG: true
      })

      await connexionWorker.initialiserFormatteurMessage({
        certificatPem: certInfo.fullchain,
        clePriveeSign: clesPrivees.signer,
        clePriveeDecrypt: clesPrivees.dechiffrer,
        DEBUG: true
      })
    } else {
      throw new Error("Pas de cert")
    }
  }

  connecterSocketIo = async () => {

    const connexionWorker = this.state.connexionWorker
    const infoIdmg = await connexionWorker.connecter()
    console.debug("Connexion socket.io completee, info idmg : %O", infoIdmg)
    this.setState({...infoIdmg})

    connexionWorker.socketOn('disconnect', this.deconnexionSocketIo)
    connexionWorker.socketOn('modeProtege', this.setEtatProtege)

  }

  setUsagerAuthentifie = async (nomUsager, estProprietaire) => {
    console.debug("Usager authentifie : %s (estProprietaire: %s)", nomUsager, estProprietaire)
    if(nomUsager) {
      localStorage.setItem('usager', nomUsager)

      await new Promise((resolve, reject)=>{
        this.setState(
          {nomUsager, estProprietaire},
          async _ => {
            // Preparer le signateur si certificat existe
            await preparerSignateurTransactions(
              nomUsager, this.state.webWorker, this.state.connexionWorker)
            resolve()
          }
        )
      })
    } else {
      // S'assurer de retirer les cles et connexions
      const webWorker = this.state.webWorker, connexionWorker = this.state.connexionWorker
      webWorker.clearInfoSecrete()
      connexionWorker.deconnecter()
    }

  }

  setFooterFige = valeur => {
    this.setState({footerFige: valeur})
  }

  goHome = _ => {
    this.setState({page: '', application: '', sousMenuApplication: ''})
  }

  setPage = page => {
    console.debug("TOP, set page %O", page)
    this.setState({page: page, application: ''})
  }

  setApplication = application => {
    this.setState({page: '', application})
  }

  toggleProtege = () => {
    if( this.state.modeProtege ) {
      // console.debug("Desactiver mode protege")
      // Desactiver mode protege
      this.state.connexionWorker.downgradePrive()
    } else {
      // console.debug("Activer mode protege")
      // Activer mode protege
      //this.state.webSocketApp.upgradeProtegerViaAuthU2F()
      this.setModalAuthentification(true)
    }
  }

  setModalAuthentification = etat => {
    this.setState({showModalAuthentification: etat})
  }

  fermerModalAuthentification = _ => {
    this.setState({showModalAuthentification: false})
  }

  // Enregistrer methode comme proxy comlink - callback via web worker
  setEtatProtege = comlinkProxy(reponse => {
    const modeProtege = reponse.etat
    console.debug("Toggle mode protege, nouvel etat : %O", reponse)
    this.setState({modeProtege}, async _ =>{
      if(modeProtege) {
        const cw = this.state.connexionWorker
        // S'assurer que le certificat du navigateur est a date
        await mettreAJourCertificatNavigateur(cw, {DEBUG: true})

        if( ! await cw.isFormatteurReady() ) {
          console.debug("Initialisation certificats et cles dans workers")
          this.preparerWorkersAvecCles()
        }
      }
    })
  })

  // Enregistrer methode comme proxy comlink - callback via web worker
  deconnexionSocketIo = comlinkProxy(() => {
    console.debug("Deconnexion Socket.IO")
    this.setState({modeProtege: false})
  })

  render() {

    // console.debug("Nom usager : %s, estProprietaire : %s", this.state.nomUsager, this.state.estProprietaire)

    var BaseLayout = LayoutAccueil

    const rootProps = {
      ...this.state,
      setModalAuthentification: this.setModalAuthentification,
      setFooterFige: this.setFooterFige,
      setCleMillegrillePresente: this.callbackCleMillegrille,
      preparerSignateurTransactions: (nomUsager) => {preparerSignateurTransactions(nomUsager, this.state.webWorker, this.state.connexionWorker)},
    }

    let affichage;
    if( ! this.state.idmgServeur ) {
      // Chargement initial, affichage page attente
      affichage = (
        <AttenteChargement />
      )
    } else if( ! this.state.nomUsager && ! this.state.estProprietaire ) {
      const searchParams = new URLSearchParams(this.props.location.search)
      const redirectUrl = searchParams.get('url')
      const erreurMotdepasse = searchParams.get('erreurMotdepasse')
      affichage = (
        <Authentifier
          redirectUrl={redirectUrl}
          erreurMotdepasse={erreurMotdepasse}
          setUsagerAuthentifie={this.setUsagerAuthentifie}
          authUrl={MG_URL_AUTHENTIFICATION}
          rootProps={rootProps} />
      )
    } else {
      affichage = (
        <Applications
          page={this.state.page}
          apiUrl={MG_URL_API}
          authUrl={MG_URL_AUTHENTIFICATION}
          nomUsagerAuthentifie={this.state.nomUsagerAuthentifie}
          setApplication={this.setApplication}
          setPage={this.setPage}
          goHome={this.goHome}
          connecterSocketIo={this.connecterSocketIo}
          rootProps={rootProps} />
      )
    }

    // const modalAuthentificationRender = modalAuthentification({
    //   rootProps,
    //   authUrl: MG_URL_AUTHENTIFICATION,
    //   show: this.state.showModalAuthentification,
    //   fermer: this.fermerModalAuthentification,
    // })

    return (
      <>
        <ModalAuthentification rootProps={rootProps}
                               authUrl={MG_URL_AUTHENTIFICATION}
                               nomUsager={this.state.nomUsager}
                               show={this.state.showModalAuthentification}
                               fermer={this.fermerModalAuthentification} />

        <BaseLayout
          changerPage={this.changerPage}
          affichage={affichage}
          goHome={this.goHome}
          sousMenuApplication={this.state.sousMenuApplication}
          footerFige={this.state.footerFige}
          rootProps={{
            ...rootProps,
            toggleProtege: this.toggleProtege,
          }} />
      </>
    )
  }
}

// Layout general de l'application
function LayoutAccueil(props) {

  var qrCode = null
  if(props.rootProps.idmgCompte) {
    qrCode = <QRCode value={'idmg:' + props.rootProps.idmgCompte} size={75} />
  }

  const pageAffichee = (
    <div>

      {props.affichage}

    </div>
  )

  return (
    <LayoutMillegrilles
      changerPage={props.changerPage}
      page={pageAffichee}
      goHome={props.goHome}
      sousMenuApplication={props.sousMenuApplication}
      rootProps={props.rootProps} />
  )
}

// Layout general de l'application
function LayoutApplication(props) {

  const pageAffichee = props.affichage

  return (
    <LayoutMillegrilles
      changerPage={props.changerPage}
      page={pageAffichee}
      goHome={props.goHome}
      sousMenuApplication={props.sousMenuApplication}
      rootProps={props.rootProps} />
  )
}

function AttenteChargement(props) {
  return (
    <Container>
      <Col>
        <Row>
          <p>Attente chargement dans un container Col/Row</p>
        </Row>
      </Col>
    </Container>
  )
}

function _setTitre(titre) {
  document.title = titre
}

async function preparerSignateurTransactions(nomUsager, webWorker, connexionWorker) {
  if(!nomUsager) throw new Error("nom usager est null")

  console.debug("Signateur transaction, chargement en cours")
  if(nomUsager) {
    var clesCerts = null
    try {
      const certInfo = await getCertificats(nomUsager)

      if(certInfo && certInfo.fullchain) {
        const fullchain = splitPEMCerts(certInfo.fullchain)
        const clesPrivees = await getClesPrivees(nomUsager)

        // Initialiser le CertificateStore
        await webWorker.initialiserCertificateStore([...fullchain].pop(), {isPEM: true, DEBUG: true})

        clesCerts = {
          certificatPem: certInfo.fullchain,
          clePriveeSign: clesPrivees.signer,
          clePriveeDecrypt: clesPrivees.dechiffrer,
        }

      } else {
        const {csr} = await getCsr(nomUsager)
        if(csr) {
          console.debug("CSR est pret, attente d'acces protege")
        } else {
          console.error("Certificat information vide : CSR:%O, certificats %O", csr, certInfo)
          throw new Error("Pas de cert")
        }
      }
    } catch(err) {
      console.error("Certificat present invalide/expire: %O", err)
      resetCertificatPem()
    }

    if(clesCerts) {
      // Initialiser web worker de chiffrage
      await webWorker.initialiserFormatteurMessage({
        ...clesCerts,
        DEBUG: true
      })

      // Initialiser web worker de connexion pour signature messages
      await connexionWorker.initialiserFormatteurMessage({
        ...clesCerts,
        DEBUG: true
      })
    }
  } else {
    console.warn("Pas d'usager")
  }
}

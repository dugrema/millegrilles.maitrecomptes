import asyncio
import json
import logging

from typing import Optional, Union

from millegrilles_messages.messages import Constantes
from millegrilles_messages.messages.Hachage import hacher
from millegrilles_messages.messages.MessagesModule import MessageWrapper
from millegrilles_messages.certificats.Generes import EnveloppeCsr
from millegrilles_web import Constantes as ConstantesWeb
from millegrilles_web.SocketIoHandler import SocketIoHandler, ErreurAuthentificationMessage

from server_maitrecomptes import Constantes as ConstantesMaitreComptes


class SocketIoMaitreComptesHandler(SocketIoHandler):

    def __init__(self, app, stop_event: asyncio.Event):
        self.__logger = logging.getLogger(__name__ + '.' + self.__class__.__name__)
        super().__init__(app, stop_event)

    async def _preparer_socketio_events(self):
        await super()._preparer_socketio_events()

        # Events disponibles sans authentification
        self._sio.on('topologie/listeApplicationsDeployees', handler=self.requete_liste_applications_deployees)
        self._sio.on('inscrireUsager', handler=self.inscrire_usager)
        self._sio.on('ajouterCsrRecovery', handler=self.ajouter_csr_recovery)

        # Events apres authentification
        self._sio.on('getRecoveryCsr', handler=self.get_recovery_csr)
        self._sio.on('genererChallenge', handler=self.generer_challenge)
        self._sio.on('signerRecoveryCsr', handler=self.signer_recovery_csr)
        self._sio.on('ajouterCleWebauthn', handler=self.ajouter_cle_webauthn)
        self._sio.on('getInfoUsager', handler=self.get_info_usager)
        self._sio.on('signerCompteUsager', handler=self.signer_compte_usager)
        self._sio.on('activerDelegationParCleMillegrille', handler=self.ajouter_delegation_par_cle_millegrille)

        # Listeners
        self._sio.on('ecouterEvenementsActivationFingerprint', handler=self.ecouter_activation_fingerprint)
        self._sio.on('retirerEvenementsActivationFingerprint', handler=self.retirer_activation_fingerprint)

        self._sio.on('ecouterEvenementsCompteUsager', handler=self.ecouter_compte_usager)
        self._sio.on('retirerEvenementsCompteUsager', handler=self.retirer_compte_usager)

    @property
    def exchange_default(self):
        return ConstantesMaitreComptes.EXCHANGE_DEFAUT

    async def connect(self, sid: str, environ: dict):
        self.__logger.debug("connect %s", sid)
        try:
            request = environ.get('aiohttp.request')
            user_id = request.headers[ConstantesWeb.HEADER_USER_ID]
            user_name = request.headers[ConstantesWeb.HEADER_USER_NAME]
            auth = request.headers[ConstantesWeb.HEADER_AUTH]
        except KeyError:
            self.__logger.debug("sio_connect SID:%s sans parametres request user_id/user_name (non authentifie)" % sid)
            return True

        async with self._sio.session(sid) as session:
            session[ConstantesWeb.SESSION_USER_NAME] = user_name
            session[ConstantesWeb.SESSION_USER_ID] = user_id
            session[ConstantesWeb.SESSION_REQUEST_AUTH] = auth

        return True

    async def executer_requete(self, sid: str, requete: dict, domaine: str, action: str,
                               exchange: Optional[str] = None, producer=None, enveloppe=None):
        """ Override pour toujours verifier que l'usager a la delegation proprietaire """
        enveloppe = await self.etat.validateur_message.verifier(requete)
        if enveloppe.get_user_id is None:
            return {'ok': False, 'err': 'Acces refuse'}

        return await super().executer_requete(sid, requete, domaine, action, exchange, producer, enveloppe)

    async def executer_commande(self, sid: str, requete: dict, domaine: str, action: str,
                                exchange: Optional[str] = None, producer=None, enveloppe=None):
        """ Override pour toujours verifier que l'usager a la delegation proprietaire """
        enveloppe = await self.etat.validateur_message.verifier(requete)
        if enveloppe.get_user_id is None:
            return {'ok': False, 'err': 'Acces refuse'}
        return await super().executer_commande(sid, requete, domaine, action, exchange, producer, enveloppe)

    # Instances
    async def get_info_usager(self, _sid: str, message: dict):
        producer = await asyncio.wait_for(self.etat.producer_wait(), timeout=0.5)

        nom_usager = message['nomUsager']
        hostname = message['hostname']
        fingerprint_public_nouveau = message.get('fingerprintPkNouveau')

        requete_usager = {'nomUsager': nom_usager, 'hostUrl': hostname}

        coros = list()

        coros.append(producer.executer_requete(
            requete_usager,
            domaine=Constantes.DOMAINE_CORE_MAITREDESCOMPTES, action='chargerUsager',
            exchange=Constantes.SECURITE_PUBLIC
        ))

        if fingerprint_public_nouveau:
            requete_fingperint = {'fingerprint_pk': fingerprint_public_nouveau}
            coros.append(producer.executer_requete(
                requete_fingperint,
                domaine=Constantes.DOMAINE_CORE_PKI, action='certificatParPk',
                exchange=Constantes.SECURITE_PRIVE
            ))

        resultat = await asyncio.gather(*coros)

        compte_usager = resultat[0].parsed
        reponse_originale = compte_usager['__original']

        try:
            reponse_certificat = resultat[1]
            reponse_originale['attachements'] = {'certificat': reponse_certificat.parsed['__original']}
        except IndexError:
            pass  # OK

        return reponse_originale

    async def requete_liste_applications_deployees(self, sid: str, message: dict):
        # return await self.executer_requete(sid, message, Constantes.DOMAINE_CORE_TOPOLOGIE,
        #                                    'listeApplicationsDeployees')
        reponse = await self.executer_requete(sid, message, Constantes.DOMAINE_CORE_TOPOLOGIE, 'listeApplicationsDeployees')

        # Ajouter un message signe localement pour prouver l'identite du serveur (instance_id)
        info_serveur = self.etat.formatteur_message.signer_message(
            Constantes.KIND_REPONSE,
            dict(),
            domaine='maitredescomptes',
            action='identite',
            ajouter_chaine_certs=True
        )[0]

        reponse['attachements'] = {'serveur': info_serveur}

        return reponse

    async def inscrire_usager(self, _sid: str, message: dict):

        nom_usager = message['nomUsager']
        idmg = self.etat.clecertificat.enveloppe.idmg

        # Verifier CSR
        try:
            csr = EnveloppeCsr.from_str(message['csr'])  # Note : valide le CSR, lance exception si erreur
        except Exception:
            reponse = {'ok': False, 'err': 'Signature CSR invalide'}
            reponse, correlation_id = self.etat.formatteur_message.signer_message(Constantes.KIND_REPONSE, reponse)
            return reponse

        # Calculer fingerprintPk
        fingperint_pk = csr.get_fingerprint_pk()  # Le fingerprint de la cle publique == la cle (32 bytes)

        # Generer nouveau user_id
        params_user_id = ':'.join([nom_usager, idmg, fingperint_pk])
        user_id = hacher(params_user_id, hashing_code='blake2s-256', encoding='base58btc')

        commande = {
            'csr': message['csr'],
            'nomUsager': nom_usager,
            'userId': user_id,
            'securite': Constantes.SECURITE_PUBLIC,
            'fingerprint_pk': fingperint_pk
        }

        producer = await asyncio.wait_for(self.etat.producer_wait(), timeout=0.5)
        resultat = await producer.executer_commande(
            commande,
            domaine=Constantes.DOMAINE_CORE_MAITREDESCOMPTES, action='inscrireUsager',
            exchange=Constantes.SECURITE_PRIVE)

        reponse_parsed = resultat.parsed
        reponse = reponse_parsed['__original']
        return reponse

    async def ajouter_csr_recovery(self, _sid: str, message: dict):
        commande = {
            'nomUsager': message['nomUsager'],
            'csr': message['csr'],
        }

        producer = await asyncio.wait_for(self.etat.producer_wait(), timeout=0.5)
        resultat = await producer.executer_commande(
            commande,
            domaine=Constantes.DOMAINE_CORE_MAITREDESCOMPTES,
            action='ajouterCsrRecovery',
            exchange=Constantes.SECURITE_PRIVE)

        reponse_parsed = resultat.parsed
        reponse = reponse_parsed['__original']
        return reponse

    async def get_recovery_csr(self, sid: str, message: dict):
        return await self.executer_requete(
            sid, message,
            domaine=Constantes.DOMAINE_CORE_MAITREDESCOMPTES,
            action='getCsrRecoveryParcode',
            exchange=Constantes.SECURITE_PRIVE
        )

    async def generer_challenge(self, sid: str, message: dict):
        reponse_challenge = await self.executer_commande(
            sid, message,
            domaine=Constantes.DOMAINE_CORE_MAITREDESCOMPTES,
            action='genererChallenge',
            exchange=Constantes.SECURITE_PRIVE
        )

        # Intercepter la reponse - on ne veut pas transmettre l'information passkey, juste le challenge
        reponse_contenu = json.loads(reponse_challenge['contenu'])

        reponse_usager = dict()

        try:
            authentication_challenge = reponse_contenu['authentication_challenge']
            passkey_authentication = reponse_contenu['passkey_authentication']

            # Conserver la passkey dans la session
            async with self._sio.session(sid) as session:
                session['authentication_challenge'] = authentication_challenge
                session['passkey_authentication'] = passkey_authentication

            reponse_usager['authentication_challenge'] = authentication_challenge
        except KeyError:
            pass  # Pas de challenge d'authentification

        try:
            reponse_usager['registration_challenge'] = reponse_contenu['registration_challenge']
        except KeyError:
            pass  # Pas de challenge de registration

        try:
            # Conserver le challenge de delegation
            session['delegation_challenge'] = reponse_contenu['challenge']
            reponse_usager['delegation_challenge'] = reponse_contenu['challenge']
        except KeyError:
            pass  # Pas de challenge de delegation

        reponse_usager, correlation = self.etat.formatteur_message.signer_message(
            Constantes.KIND_REPONSE, reponse_usager)

        return reponse_usager

    async def signer_recovery_csr(self, sid: str, message: dict):
        return await self.executer_commande(
            sid, message,
            domaine=Constantes.DOMAINE_CORE_MAITREDESCOMPTES,
            action='signerCompteUsager',
            exchange=Constantes.SECURITE_PRIVE
        )

    async def ajouter_cle_webauthn(self, sid: str, message: dict):
        reponse = await self.executer_commande(
            sid, message,
            domaine=Constantes.DOMAINE_CORE_MAITREDESCOMPTES,
            action='ajouterCle',
            exchange=Constantes.SECURITE_PRIVE
        )
        return reponse

    async def signer_compte_usager(self, sid: str, message: dict):
        reponse = await self.executer_commande(
            sid, message,
            domaine=Constantes.DOMAINE_CORE_MAITREDESCOMPTES,
            action='signerCompteUsager',
            exchange=Constantes.SECURITE_PRIVE
        )
        return reponse

    async def ajouter_delegation_par_cle_millegrille(self, sid: str, message: dict):
        reponse = await self.executer_commande(
            sid, message,
            domaine=Constantes.DOMAINE_CORE_MAITREDESCOMPTES,
            action='ajouterDelegationSignee',
            exchange=Constantes.SECURITE_PRIVE
        )
        return reponse

    # Listeners

    async def ecouter_activation_fingerprint(self, sid: str, message: dict):
        "ecouterEvenementsActivationFingerprint"
        exchanges = [Constantes.SECURITE_PRIVE]
        fingerprint_pk = message['fingerprintPk']
        routing_keys = [f'evenement.CoreMaitreDesComptes.{fingerprint_pk}.activationFingerprintPk']
        # Note : message non authentifie (sans signature). Flag enveloppe=False empeche validation.
        reponse = await self.subscribe(sid, message, routing_keys, exchanges, enveloppe=False, session_requise=False)
        reponse_signee, correlation_id = self.etat.formatteur_message.signer_message(Constantes.KIND_REPONSE, reponse)
        return reponse_signee

    async def retirer_activation_fingerprint(self, sid: str, message: dict):
        "retirerEvenementsActivationFingerprint"
        # Note : message non authentifie (sans signature)
        exchanges = [Constantes.SECURITE_PRIVE]
        fingerprint_pk = message['fingerprintPk']
        routing_keys = [f'evenement.CoreMaitreDesComptes.{fingerprint_pk}.activationFingerprintPk']
        reponse = await self.unsubscribe(sid, message, routing_keys, exchanges, session_requise=False)
        reponse_signee, correlation_id = self.etat.formatteur_message.signer_message(Constantes.KIND_REPONSE, reponse)
        return reponse_signee

    async def ecouter_compte_usager(self, sid: str, message: dict):
        "ecouterEvenementsCompteUsager"

        # La session n'est pas necessairement authentifiee completement. Utiliser signature.
        enveloppe = await self.etat.validateur_message.verifier(message)
        user_id = enveloppe.get_user_id

        exchanges = [Constantes.SECURITE_PRIVE]
        routing_keys = [f'evenement.CoreMaitreDesComptes.{user_id}.majCompteUsager']
        reponse = await self.subscribe(sid, message, routing_keys, exchanges, enveloppe=enveloppe, session_requise=False, user_id=user_id)
        reponse_signee, correlation_id = self.etat.formatteur_message.signer_message(Constantes.KIND_REPONSE, reponse)
        return reponse_signee

    async def retirer_compte_usager(self, sid: str, message: dict):
        "retirerEvenementsCompteUsager"

        # La session n'est pas necessairement authentifiee completement. Utiliser signature.
        enveloppe = await self.etat.validateur_message.verifier(message)
        user_id = enveloppe.get_user_id

        exchanges = [Constantes.SECURITE_PRIVE]
        routing_keys = [f'evenement.CoreMaitreDesComptes.{user_id}.majCompteUsager']
        reponse = await self.unsubscribe(sid, message, routing_keys, exchanges, session_requise=False)
        reponse_signee, correlation_id = self.etat.formatteur_message.signer_message(Constantes.KIND_REPONSE, reponse)
        return reponse_signee

import { useState, useCallback, useMemo } from 'react'
import Nav from 'react-bootstrap/Nav'
import Navbar from 'react-bootstrap/Navbar'
import NavDropdown from 'react-bootstrap/NavDropdown'

import { useTranslation, Trans } from 'react-i18next'

import { Menu as MenuMillegrilles, DropDownLanguage, ModalInfo } from '@dugrema/millegrilles.reactjs'
import useWorkers, { useEtatConnexion, useInfoConnexion } from './WorkerContext'

import { cleanupNavigateur } from './comptesUtil'

import manifest from './manifest.build'

function Menu(props) {

    const { i18n, setSectionAfficher } = props

    const workers = useWorkers()
    const { t } = useTranslation()
    const etatConnexion = useEtatConnexion()
    const infoConnexion = useInfoConnexion()

    const idmg = infoConnexion.idmg

    const [showModalInfo, setShowModalInfo] = useState(false)
    const handlerCloseModalInfo = useCallback(()=>setShowModalInfo(false), [setShowModalInfo])

    // const usagerProprietaire = useMemo(()=>usagerExtensions.delegationGlobale === 'proprietaire', [usagerExtensions])

    const handlerSelect = eventKey => {
        switch(eventKey) {
            case 'applications': break

            // Menu default
            case 'information': setShowModalInfo(true); break
            case 'deconnecter': deconnecter(workers); break

            // Sections
            case 'SectionAjouterMethode': 
            case 'SectionActiverCompte': 
            case 'SectionActiverDelegation': 
                setSectionAfficher(eventKey)
                break
            
            default:
        }
    }

    const handlerChangerLangue = eventKey => {i18n.changeLanguage(eventKey)}
    const brand = useMemo(()=>(
        <Navbar.Brand>
            <Nav.Link title={t('titre')}>
                <Trans>titre</Trans>
            </Nav.Link>
        </Navbar.Brand>
    ), [t])

    return (
        <>
            <MenuMillegrilles brand={brand} labelMenu="Menu" etatConnexion={etatConnexion} onSelect={handlerSelect}>
            
                <Nav.Link eventKey="information" title="Afficher l'information systeme">
                    <Trans>menu.information</Trans>
                </Nav.Link>
            
                <NavDropdown title="Compte" id="compte-nav-dropdown">
                    <NavDropdown.Item eventKey='SectionAjouterMethode'>Ajouter cle</NavDropdown.Item>
                    <NavDropdown.Item eventKey='SectionActiverCompte'>Activer code</NavDropdown.Item>
                    <NavDropdown.Item eventKey='SectionActiverDelegation'>Administrer</NavDropdown.Item>
                </NavDropdown>

                <DropDownLanguage title={t('menu.language')} onSelect={handlerChangerLangue}>
                    <NavDropdown.Item eventKey="en-US">English</NavDropdown.Item>
                    <NavDropdown.Item eventKey="fr-CA">Francais</NavDropdown.Item>
                </DropDownLanguage>
            
                <Nav.Link eventKey="deconnecter" title={t('deconnecter')}>
                    <Trans>menu.deconnecter</Trans>
                </Nav.Link>
            
            </MenuMillegrilles>
            
            <ModalInfo 
                show={showModalInfo} 
                fermer={handlerCloseModalInfo} 
                manifest={manifest} 
                idmg={idmg} />
        </>
    )
}

export default Menu

async function deconnecter(workers) {
    console.debug("Deconnecter")
    await cleanupNavigateur()
    await workers.connexion.deconnecter()
    window.location = '/auth/deconnecter_usager'
}

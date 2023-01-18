import { useState, useCallback, useMemo } from 'react'
import Nav from 'react-bootstrap/Nav'
import Navbar from 'react-bootstrap/Navbar'
import NavDropdown from 'react-bootstrap/NavDropdown'

import { useTranslation, Trans } from 'react-i18next'

import { Menu as MenuMillegrilles, DropDownLanguage, ModalInfo } from '@dugrema/millegrilles.reactjs'

import manifest from './manifest.build'

function Menu(props) {

    const { i18n, etatConnexion, idmg } = props

    const { t } = useTranslation()
    const [showModalInfo, setShowModalInfo] = useState(false)
    const handlerCloseModalInfo = useCallback(()=>setShowModalInfo(false), [setShowModalInfo])

    const handlerSelect = eventKey => {
        switch(eventKey) {
            case 'applications': break
            case 'information': setShowModalInfo(true); break
            case 'deconnecter': window.location = '/millegrilles/authentification/fermer'; break
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
                    <NavDropdown.Item eventKey='ajouterCle'>Ajouter cle</NavDropdown.Item>
                    <NavDropdown.Item eventKey='activerCode'>Activer code</NavDropdown.Item>
                    <NavDropdown.Item eventKey='activerDelegation'>Administrer</NavDropdown.Item>
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

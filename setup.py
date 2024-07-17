from setuptools import setup, find_packages

from os import environ

__VERSION__ = environ.get('VBUILD') or '2024.0.0'


setup(
    name='millegrilles_maitrecomptes',
    version=__VERSION__,
    packages=find_packages(),
    url='https://github.com/dugrema/millegrilles.maitrecomptes',
    license='AFFERO',
    author='Mathieu Dugre',
    author_email='mathieu.dugre@mdugre.info',
    description="Client web et serveur pour page accueil MilleGrilles",
    install_requires=[]
)

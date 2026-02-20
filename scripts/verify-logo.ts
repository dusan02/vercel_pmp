
import https from 'https';

const urls = [
    'https://cdn.worldvectorlogo.com/logos/palo-alto-networks.svg',
    'https://upload.wikimedia.org/wikipedia/commons/2/23/Palo_Alto_Networks_logo.svg',
    'https://companieslogo.com/img/orig/PANW-33860bb4.png',
    'https://logo.clearbit.com/paloaltonetworks.com'
];

async function check(url: string) {
    return new Promise((resolve) => {
        https.get(url, (res) => {
            console.log(`${url}: ${res.statusCode}`);
            resolve(true);
        }).on('error', (e) => {
            console.log(`${url}: Error ${e.message}`);
            resolve(false);
        });
    });
}

async function main() {
    for (const url of urls) {
        await check(url);
    }
}

main();

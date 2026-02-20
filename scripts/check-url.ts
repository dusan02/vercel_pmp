
async function checkUrl(url: string) {
    try {
        const res = await fetch(url, { method: 'HEAD' });
        console.log(`${url}: ${res.status}`);
    } catch (e: any) {
        console.log(`${url}: Error ${e.message}`);
    }
}

async function main() {
    await checkUrl('https://upload.wikimedia.org/wikipedia/commons/2/23/Palo_Alto_Networks_logo.svg');
    await checkUrl('https://logo.clearbit.com/paloaltonetworks.com');
}

main();

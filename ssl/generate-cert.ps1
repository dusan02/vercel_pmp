# PowerShell script pre generovanie SSL certifikátu
# Používa .NET Certificate API

$cert = New-SelfSignedCertificate -DnsName "localhost", "premarketprice.com", "www.premarketprice.com" -CertStoreLocation "cert:\LocalMachine\My" -NotAfter (Get-Date).AddYears(1) -KeyAlgorithm RSA -KeyLength 2048

# Export certifikátu
$certPath = "ssl\premarketprice.crt"
$keyPath = "ssl\premarketprice.key"

# Export certifikátu v PEM formáte
$certBytes = $cert.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Cert)
[System.IO.File]::WriteAllBytes($certPath, $certBytes)

# Export privátneho kľúča (ak je to možné)
try {
    $privateKey = $cert.PrivateKey
    if ($privateKey) {
        $keyBytes = $privateKey.ExportCspBlob($true)
        [System.IO.File]::WriteAllBytes($keyPath, $keyBytes)
        Write-Host "✅ SSL certifikát a kľúč vytvorené úspešne!"
    }
    else {
        Write-Host "⚠️ Privátny kľúč sa nepodarilo exportovať"
    }
}
catch {
    Write-Host "⚠️ Chyba pri exporte privátneho kľúča: $_"
}

Write-Host "📁 Certifikát uložený v: $certPath"
Write-Host "🔑 Kľúč uložený v: $keyPath" 
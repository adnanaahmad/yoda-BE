# Quick start

* Please remember that all our APIs require the proper client certificates which are typically different for each environment.

### Secure MFA
* [https://developer.fortifid.com/product/mfa/reference](https://developer.fortifid.com/product/mfa/reference)

OpenAPI 3.0 spec:
* [https://portal-uat.fortifid.com/public/api/yaml/mfa](https://portal-uat.fortifid.com/public/api/yaml/mfa)

Postman:
* [Run in Postman](https://god.gw.postman.com/run-collection/dc0aae024b466c2b10a6)
* [Download](https://www.getpostman.com/collections/dc0aae024b466c2b10a6)

#### Examples:

**generate-url**
```bash
curl --location --request POST 'https://api-uat.fortifid.com/v1/mfa/generate-url' \
--header 'Content-Type: application/json' \
--key ./uat-key.pem \
--cert ./uat-cert.pem \
--data-raw '{
    "phone_number": "+1 8015551213",
    "full_name": "JOSHUA RKHTGZWR",
    "request_reference": "abcd1234",
    "redirect_url": "https://fortifid.com",
    "sms_text": "Please follow link to verify your phone number: %URL%",
    "link_url": "https://custom-verify.com/verify/%URL%",
    "lookup": true,
    "allow_voip": true,
    "shorten_url": false,
    "send": true
}'
```
**check-request**
```bash
curl --location --request GET 'https://api-uat.fortifid.com/v1/mfa/check-request/{tranasaction_id}' \
--key ./uat-key.pem \
--cert ./uat-cert.pem
```

**verify**
```bash
curl --location --request GET 'https://api-uat.fortifid.com/v1/mfa/verify/{tranasaction_id}' \
--key ./uat-key.pem \
--cert ./uat-cert.pem
```

### Document Verification
* [https://developer.fortifid.com/product/doc-verify/reference](https://developer.fortifid.com/product/doc-verify/reference)

OpenAPI 3.0 spec:
* [https://portal-uat.fortifid.com/public/api/yaml/doc-verify](https://portal-uat.fortifid.com/public/api/yaml/doc-verify)

Postman:
* [Run in Postman](https://god.gw.postman.com/run-collection/f31f0433c0b8a154a17a)
* [Download](https://www.getpostman.com/collections/f31f0433c0b8a154a17a)

#### Examples:

**generate-url**
```bash
curl --location --request POST 'https://api-uat.fortifid.com/v1/doc/generate-url' \
--header 'Content-Type: application/json' \
--key ./uat-key.pem \
--cert ./uat-cert.pem \
--data-raw '{
    "phone_number": "+1 8015551213",
    "email_address": "mckinley@yzggfp.com",
    "full_name": "JOSHUA RKHTGZWR",
    "birth_date": "reprehenderit laboris",
    "request_reference": "abcd1234",
    "redirect_url": "https://fortifid.com",
    "sms_text": "Please follow link to verify your identity: %URL%",
    "link_url": "https://custom-verify.com/verify/%URL%",
    "strict": true,
    "shorten_url": false
}'
```

**check-request**
```bash
curl --location --request GET 'https://api-uat.fortifid.com/v1/doc/check-request/{tranasaction_id}' \
--key ./uat-key.pem \
--cert ./uat-cert.pem
```

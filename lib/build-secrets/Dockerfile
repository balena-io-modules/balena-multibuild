#TODO: We'll want this to be packaged into a single image,
#rather than having to install jq every time for example
FROM %%ARCH%%/alpine:3.10

RUN apk update && apk add bash jq

COPY secrets.json populate.sh ./
RUN bash populate.sh

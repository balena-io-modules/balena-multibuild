#TODO: We'll want this to be packaged into a single image,
#rather than having to install jq every time for example
FROM balenalib/%%ARCH%%-alpine:3.9

RUN apk update && apk add jq

COPY secrets.json populate.sh ./
RUN bash populate.sh

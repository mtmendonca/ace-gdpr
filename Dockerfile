FROM node:10-alpine
WORKDIR /home/app
ENV PATH=${PATH}:/home/app/.bin
COPY . .
CMD npm run dev
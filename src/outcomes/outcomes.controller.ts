import { Controller, Get, HttpCode, Post, UsePipes, ValidationPipe, Body, Patch, Delete, Param, NotFoundException, ForbiddenException, UseGuards, ConflictException, Req } from '@nestjs/common';
import { ApiNoContentResponse, ApiBadRequestResponse, ApiUnauthorizedResponse, ApiOkResponse, ApiForbiddenResponse, ApiNotFoundResponse, ApiCreatedResponse, ApiBody, ApiConflictResponse } from '@nestjs/swagger';
import { OutcomeReadDTO } from '../DTO/OutcomeRead.DTO';
import { OutcomeWriteDTO } from '../DTO/OutcomeWrite.DTO';
import { MappingWriteDTO } from '../DTO/MappingWrite.DTO';
import { OutcomesService } from './outcomes.service';
import * as request from 'superagent';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RouteParameterDTO } from 'src/DTO/RouteParameter.DTO';
import { Outcome } from 'src/Models/Outcome.Schema';
import { Request } from 'express';
import { GuidelineDTO } from 'src/DTO/GuidelineReadDTO';
import { JwtStrategy } from './jwt.strategy';

@Controller()
export class OutcomesController {

  constructor(private outcomeService: OutcomesService, private jwt: JwtStrategy) {}

  @ApiOkResponse({ description: 'OK' })
  @ApiBadRequestResponse({ description: 'Invalid username' })
  @ApiForbiddenResponse({ description: 'If the object is unreleased and requester is not the author || If the object is waiting, review, or proofing and the requester is not privileged' })
  @ApiNotFoundResponse({ description: 'User is not found || Learning Object is not found' })
  @Get('/users/:username/learning-objects/:learningObjectID/outcomes')
  @UsePipes(ValidationPipe)
  @HttpCode(200)
  async getOutcomesForLearningObject(@Param() routeParameterDTO: RouteParameterDTO, @Req() request: Request): Promise<OutcomeReadDTO[]> {

    const user = await this.getUser(routeParameterDTO.username);
  
    const learningObject = await this.getLearningObject(routeParameterDTO.username, routeParameterDTO.learningObjectID, request.headers.authorization);

    // TODO: add pagination
    const outcomes = await this.outcomeService.findOutcomesForLearningObject(routeParameterDTO.learningObjectID);

    const outcomeResponses = [];
    let guidelineMappings = [];

    for(let i=0; i < outcomes.length; i++) {
      if (outcomes[i].mappings.length > 0) {
        guidelineMappings = [];
        for(let j=0; j < outcomes[i].mappings.length; j++){
          const map = await this.getGuideline(outcomes[i].mappings[j]);
          if (map) {
            const guideline: GuidelineDTO = {
              _id: map._id,
              author: map.author,
              date: map.date,
              outcome: map.outcome,
              source: map.source,
              tag: map.tag,
              name: map.name,
            }
            guidelineMappings.push(guideline);
          }
         }
        }
        const outcomeResponse: OutcomeReadDTO = {
          _id: outcomes[i]['_id'],
          bloom: outcomes[i].bloom,
          verb: outcomes[i].verb,
          text: outcomes[i].text,
          lastUpdated: outcomes[i].lastUpdated,
          mappings: guidelineMappings,
        }
        outcomeResponses.push(outcomeResponse);
    }
    return outcomeResponses;
  }

  @ApiOkResponse({ description: 'OK' })
  @ApiBadRequestResponse({ description: 'Invalid username' })
  @ApiForbiddenResponse({ description: 'If the object is waiting, in review, proofing or released and requester is not the author || The requester is not the author' })
  @ApiNotFoundResponse({ description: 'User is not found' })
  @Delete('/users/:username/learning-objects/:learningObjectID/outcomes')
  @UsePipes(ValidationPipe)
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  async deleteOutcomesForLearningObject(@Param() routeParameterDTO: RouteParameterDTO, @Req() request: Request): Promise<void> {

    const token = await this.jwt.validate(request);

    // Checks to see if the token is a service token. If the token is not a service key, check to make sure that the learning object exists
    if (!token.user.SERVICE_KEY) {
      const learningObject = await this.getLearningObject(routeParameterDTO.username, routeParameterDTO.learningObjectID, request.headers.authorization);
    }

    const user = await this.getUser(routeParameterDTO.username);

    const outcomes = await this.outcomeService.findOutcomesForLearningObject(routeParameterDTO.learningObjectID);
     
    await this.outcomeService.deleteOutcomesForLearningObject(routeParameterDTO.learningObjectID);
  }

  @ApiBadRequestResponse({ description: 'Invalid bloom || Invalid verb || Invalid username'})
  @ApiUnauthorizedResponse({ description: 'If the requester is not signed in' })
  @ApiForbiddenResponse({ description: 'If the Learning Object is unreleased and the requester is not the author || If the Learning Object is in waiting, review, or proofing and requester is not privileged || If the object is released' })
  @ApiNotFoundResponse({ description: 'Username not found || Learning Object not found'})
  @ApiBody({ type: OutcomeWriteDTO })
  @Post('/users/:username/learning-objects/:learningObjectID/outcomes')
  @UseGuards(JwtAuthGuard)
  @UsePipes(ValidationPipe)
  @HttpCode(200)
  async addOutcome(@Body() outcomeWriteDTO: OutcomeWriteDTO, @Param() routeParameterDTO: RouteParameterDTO, @Req() request: Request): Promise<void> {

    const user = await this.getUser(routeParameterDTO.username);

    const learningObject = await this.getLearningObject(routeParameterDTO.username, routeParameterDTO.learningObjectID, request.headers.authorization);

    const update = await this.updateLearningObjectDate(routeParameterDTO.username, routeParameterDTO.learningObjectID, request.headers.authorization);

    const outcomeID = this.outcomeService.create(outcomeWriteDTO, routeParameterDTO.learningObjectID);
    
    return outcomeID;

  }

  @ApiNoContentResponse({ description: 'No Content' })
  @ApiBadRequestResponse({ description: 'Invalid bloom || Invalid text || Invalid verb || Invalid username'})
  @ApiUnauthorizedResponse({ description: 'If the requester is not signed in' })
  @ApiForbiddenResponse({ description: 'If Learning Object is unreleased and requester is not the author || If Learning Object is in waiting, review, proofing and requester is not privileged || If Learning Object is released' })
  @ApiNotFoundResponse({ description: 'Username not found || Learning Object not found || Outcome not found' })
  @ApiConflictResponse({ description: 'Update would create a duplicate' })
  @ApiBody({ type: OutcomeWriteDTO })
  @Patch('/users/:username/learning-objects/:learningObjectID/outcomes/:outcomeID')
  @UseGuards(JwtAuthGuard)
  @UsePipes(ValidationPipe)
  @HttpCode(200)
  async updateOutcome(@Body() outcomeWriteDTO: OutcomeWriteDTO, @Param() routeParameterDTO: RouteParameterDTO, @Req() request: Request): Promise<void> {

    const user = await this.getUser(routeParameterDTO.username);

    const learningObject = await this.getLearningObject(routeParameterDTO.username, routeParameterDTO.learningObjectID, request.headers.authorization);

    const outcome = await this.getOutcome(routeParameterDTO.outcomeID);

    const update = await this.updateLearningObjectDate(routeParameterDTO.username, routeParameterDTO.learningObjectID, request.headers.authorization);

    await this.outcomeAlreadyExists(outcomeWriteDTO, routeParameterDTO.learningObjectID);

    const outcomeId = this.outcomeService.update(outcomeWriteDTO, routeParameterDTO.outcomeID);

    return outcomeId;

  }

  @ApiNoContentResponse({ description: 'No Content' })
  @ApiBadRequestResponse({ description: 'Invalid username' })
  @ApiUnauthorizedResponse({ description: 'If the requester is not signed in' })
  @ApiForbiddenResponse({ description: 'If Learning Object is released || If Learning Object is in waiting, review, proofing and requester is not privileged || If Learning Object is unreleased and requester is not the author' })
  @ApiNotFoundResponse({ description: 'Username not found || Learning Object not found ||  Outcome not found' })
  @Delete('/users/:username/learning-objects/:learningObjectID/outcomes/:outcomeID')
  @UseGuards(JwtAuthGuard)
  @UsePipes(ValidationPipe)
  @HttpCode(204)
  async deleteOutcome(@Param() routeParameterDTO: RouteParameterDTO, @Req() request: Request): Promise<void> {

    const user = await this.getUser(routeParameterDTO.username);

    const learningObject = await this.getLearningObject(routeParameterDTO.username, routeParameterDTO.learningObjectID, request.headers.authorization);

    const outcome = await this.getOutcome(routeParameterDTO.outcomeID);

    const update = await this.updateLearningObjectDate(routeParameterDTO.username, routeParameterDTO.learningObjectID, request.headers.authorization);

    await this.outcomeService.delete(routeParameterDTO.outcomeID);

  }

  @ApiNoContentResponse({ description: 'No Content' })
  @ApiBadRequestResponse({ description: 'Invalid username' })
  @ApiUnauthorizedResponse({ description: 'If the requester is not signed in' })
  @ApiForbiddenResponse({ description: 'If Learning Object is unreleased and requester is not the author || If Learning Object is in waiting, review, proofing and requester is not privileged || If Learning Object is released and the requester is not a mapper, editor, or admin' })
  @ApiNotFoundResponse({ description: 'Username not found || Learning Object not found || Outcome not found || Guideline not found' })
  @ApiConflictResponse({ description: 'Update would create a duplicate' })
  @ApiBody({ type: MappingWriteDTO })
  @Post('/users/:username/learning-objects/:learningObjectID/outcomes/:outcomeID/mappings')
  @UseGuards(JwtAuthGuard)
  @UsePipes(ValidationPipe)
  @HttpCode(204)
  async addMapping(@Body() mappingWriteDTO: MappingWriteDTO, @Param() routeParameterDTO: RouteParameterDTO, @Req() request: Request): Promise<void> {

    const user = await this.getUser(routeParameterDTO.username);

    const learningObject = await this.getLearningObject(routeParameterDTO.username, routeParameterDTO.learningObjectID, request.headers.authorization);

    const outcome = await this.getOutcome(routeParameterDTO.outcomeID);

    const guideline = await this.getGuideline(mappingWriteDTO.guidelineID);

    this.checkForDuplicateMapping(outcome, mappingWriteDTO.guidelineID);

    const update = await this.updateLearningObjectDate(routeParameterDTO.username, routeParameterDTO.learningObjectID, request.headers.authorization);

    outcome.mappings.push(guideline.id);

    await this.outcomeService.setMappings(outcome);

  }

  @ApiNoContentResponse({ description: 'No Content' })
  @ApiBadRequestResponse({ description: 'Invalid username' })
  @ApiUnauthorizedResponse({ description: 'The requester is not signed in' })
  @ApiForbiddenResponse({ description: 'If Learning Object is in waiting, review, proofing and requester is not privileged || If the Learning Object is released and the requester is not a mapper, editor, or admin || If Learning Object is unreleased and requester is not the author' })
  @ApiNotFoundResponse({ description: 'Username not found || Learning Object not found || Outcome not found || Mapping not found' })
  @Delete('/users/:username/learning-objects/:learningObjectID/outcomes/:outcomeID/mappings/:guidelineID')
  @UseGuards(JwtAuthGuard)
  @UsePipes(ValidationPipe)
  @HttpCode(204)
  async deleteMapping(@Param() routeParameterDTO: RouteParameterDTO, @Req() request: Request): Promise<void> {

    const user = await this.getUser(routeParameterDTO.username);

    const learningObject = await this.getLearningObject(routeParameterDTO.username, routeParameterDTO.learningObjectID, request.headers.authorization);

    const outcome = await this.getOutcome(routeParameterDTO.outcomeID);

    const guideline = await this.getGuideline(routeParameterDTO.guidelineID);

    const update = await this.updateLearningObjectDate(routeParameterDTO.username, routeParameterDTO.learningObjectID, request.headers.authorization);
    
    const i = outcome.mappings.indexOf(routeParameterDTO.guidelineID);
    outcome.mappings.splice(i, 1);

    await this.outcomeService.setMappings(outcome);

  }

  @ApiOkResponse({ description: 'OK' })
  @Get('/outcomes/stats')
  @HttpCode(200)
  async getStats() {
    const BLOOMS = {
      APPLY: 'Apply and Analyze',
      EVALUATE: 'Evaluate and Synthesize',
      REMEMBER: 'Remember and Understand',
    };

    const outcomes = await this.outcomeService.getStats();

    const stats = {
      apply: 0,
      evaluate: 0,
      remember: 0,
    };

    if (outcomes && outcomes.length) {
      outcomes.forEach(outcome => {
        switch(outcome.bloom) {
          case BLOOMS.APPLY:
            stats.apply++;
            break;
          case BLOOMS.EVALUATE:
            stats.evaluate++;
            break;
          case BLOOMS.REMEMBER:
            stats.remember++;
        }
      })
    }

    return stats;
  }


  async getUser(username: string) {
    try {
      const response = await request
        .get(`${process.env.USER_SERVICE_API}/users/${username}/profile`)
        .set('Accept', 'application/json')

      return response.body;

    } catch (error) {
      throw new NotFoundException('The specified user was not found');
    };
  }

  async getLearningObject(username: string, learningObjectID: string, user: any) {
    try {
      const response = await request
        .get(`${process.env.LEARNING_OBJECT_SERVICE_API}/users/${username}/learning-objects/${learningObjectID}`)
        .set('Accept', 'application/json')
        .set('Authorization', user)

      return response.body;

    } catch (error) {
      if (error.status === 401) {
        throw new ForbiddenException('You do not have permission to view the requested Learning Object');
      } else {
        throw new NotFoundException('The specified Learning Object was not found');
      }
    };
  }

  async updateLearningObjectDate(username: string, learningObjectId: string, user: any) {
    try {
      const response = await request
        .patch(`${process.env.LEARNING_OBJECT_SERVICE_API}/users/${username}/learning-objects/${learningObjectId}`)
        .set('Accept', 'application/json')
        .set('Authorization', user)
        .send({"learningObject": {}})

      return response.body;
    } catch (error) {
      if (error.status === 401) {
        throw new ForbiddenException('You do not have permission to update the requested Learning Object');
      } else if (error.status === 404) {
        throw new NotFoundException('The specified Learning Object was not found');
      }
    }
  }

  async getOutcome(outcomeID: string) {
    const outcome = await this.outcomeService.findOne(outcomeID);

    if (!outcome) {
      throw new NotFoundException('The specified Outcome was not found');
    }

    return outcome;
  }

  async getGuideline(guidelineID: string) {
    const guideline = await this.outcomeService.getGuideline(guidelineID);
    
    return guideline;
  }

  async outcomeAlreadyExists(newOutcome, learningObjectID) {
    const existingOutcome = await this.outcomeService.findExactOutcomeMatch(newOutcome, learningObjectID);

    if (existingOutcome) {
      throw new ConflictException('The specified Outcome already exists');
    }
  }

  checkForDuplicateMapping(outcome: Outcome, newGuidelineID: string) {
    if (outcome.mappings.includes(newGuidelineID)) {
      throw new ConflictException('The specified Guideline is already mapped to the specified Outcome');
    }
  }
}

import { Body, Controller, Get, Headers, HttpCode, Ip, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiHeader, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  Conversation,
  MeshMessage,
  MeshNode,
  PositionRequestResult,
  RadioStatus,
  SendMessageRequest,
} from '../domain/mesh.dto';
import { MeshClient } from '../infrastructure/mesh.client';

/**
 * Domain "mesh": text messages over a Meshtastic LoRa node (the mesh
 * container holds the radio). Live feed: socket namespace /mesh.
 */
@ApiTags('mesh')
@Controller('api/mesh')
export class MeshController {
  constructor(private readonly mesh: MeshClient) {}

  /** Radio state, own node, channels and the send settings. */
  @Get('status')
  status(): Promise<RadioStatus> {
    return this.mesh.status();
  }

  /** Conversations with traffic, newest first. */
  @Get('conversations')
  conversations(): Promise<Conversation[]> {
    return this.mesh.conversations();
  }

  /** Messages of one conversation, newest last; page back with `before` (a message id). */
  @Get('messages')
  @ApiQuery({ name: 'before', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  messages(
    @Query('conv') conv: string,
    @Query('before', new ParseIntPipe({ optional: true })) before?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ): Promise<MeshMessage[]> {
    return this.mesh.messages(conv, before, limit);
  }

  /** Every node the radio has heard of. */
  @Get('nodes')
  nodes(): Promise<MeshNode[]> {
    return this.mesh.nodes();
  }

  /**
   * Ask every node for its current position. The requests go out one every
   * 5 s; replies update the nodes (event `node`). 503 radio down.
   */
  @Post('positions/request')
  @HttpCode(202)
  requestPositions(): Promise<PositionRequestResult> {
    return this.mesh.requestPositions();
  }

  /** Send a text to a channel or a node. 401 wrong PIN, 429 rate limit, 503 radio down. */
  @Post('messages')
  @ApiHeader({ name: 'X-Send-PIN', required: false, description: 'MESH_SEND_PIN, when set' })
  send(
    @Body() body: SendMessageRequest,
    @Headers('x-send-pin') pin: string | undefined,
    @Ip() ip: string,
  ): Promise<MeshMessage> {
    return this.mesh.send(body.conv, body.text, pin, ip);
  }
}

import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { AxiosResponse, AxiosRequestConfig } from 'axios';
import { lastValueFrom } from 'rxjs';

@Injectable()
export class AxiosService {
  constructor(private readonly httpService: HttpService) {}

  async post(
    url: string,
    data: any,
    config?: AxiosRequestConfig<any>,
  ): Promise<AxiosResponse<any>> {
    try {
      const response = this.httpService.post(url, data, config);
      return await lastValueFrom(response);
    } catch (error: any) {
      throw new HttpException(
        error.response?.data || 'Error making POST request',
        error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async get(
    url: string,
    config?: AxiosRequestConfig<any>,
  ): Promise<AxiosResponse<any>> {
    try {
      const response = this.httpService.get(url, config);
      return await lastValueFrom(response);
    } catch (error: any) {
      throw new HttpException(
        error.response?.data || 'Error making GET request',
        error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async put(
    url: string,
    data: any,
    config?: AxiosRequestConfig<any>,
  ): Promise<AxiosResponse<any>> {
    try {
      const response = this.httpService.put(url, data, config);
      return await lastValueFrom(response);
    } catch (error: any) {
      throw new HttpException(
        error.response?.data || 'Error making PUT request',
        error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
